import json
import os
import time
import urllib.request
import urllib.error

import boto3

textract = boto3.client("textract")
dynamodb = boto3.resource("dynamodb")

# Get the table name from Lambda environment variables
OCR_TABLE_NAME = os.environ["OCR_RESULTS_TABLE"]
ocr_table = dynamodb.Table(OCR_TABLE_NAME)

# --- Gemini configuration ---
# NOTE: this Lambda no longer uses OpenAI/Groq. Set GEMINI_API_KEY in this
# function's environment variables (AWS Console -> Lambda -> Configuration ->
# Environment variables), the same way OPENAI_API_KEY/GROQ_API_KEY were set
# before. GEMINI_MODEL is optional and defaults to gemini-2.0-flash.
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
)


def extract_textract_summary(textract_response):
    """Pull just the useful fields out of Textract's AnalyzeExpense response.
    The raw response is large and noisy (ResponseMetadata, geometry/bounding
    box data, confidence scores, etc.) - trimming it down keeps the Gemini
    prompt small and focused on what actually matters: line items + totals."""
    summary_fields = []
    line_items = []
    for doc in textract_response.get("ExpenseDocuments", []):
        for field in doc.get("SummaryFields", []):
            label = (
                field.get("LabelDetection", {}).get("Text")
                or field.get("Type", {}).get("Text")
            )
            value = field.get("ValueDetection", {}).get("Text")
            if label and value:
                summary_fields.append({"label": label, "value": value})
        for group in doc.get("LineItemGroups", []):
            for line_item in group.get("LineItems", []):
                item = {}
                for field in line_item.get("LineItemExpenseFields", []):
                    field_type = field.get("Type", {}).get("Text")
                    field_value = field.get("ValueDetection", {}).get("Text")
                    if field_type and field_value:
                        item[field_type] = field_value
                if item:
                    line_items.append(item)
    return {"summaryFields": summary_fields, "lineItems": line_items}


def call_gemini(textract_summary):
    """Send the trimmed Textract data to Gemini and get back clean, structured
    receipt JSON (this replaces the old GPT-4o refinement step)."""
    prompt = (
        "You are a receipt processor. Based on the following data extracted by "
        "AWS Textract from a bill/receipt, return ONLY a raw JSON object "
        "(no markdown fences, no commentary) with this exact shape: "
        '{"items": [{"name": string, "amount": number}], '
        '"subtotal": number, "tax": number, "total": number}. '
        "If a field is missing from the Textract data, make a best-effort "
        "estimate from the line items so the numbers stay consistent.\n\n"
        f"Textract data: {json.dumps(textract_summary)}"
    )

    request_payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
        },
    }

    req = urllib.request.Request(
        GEMINI_URL,
        data=json.dumps(request_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            response_data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as http_err:
        error_body = http_err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini API error {http_err.code}: {error_body}") from http_err

    text = response_data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def handler(event, context):
    record = event['Records'][0]['s3']
    bucket = record['bucket']['name']
    key = record['object']['key']

    try:
        # 1. Trigger Textract AnalyzeExpense
        textract_response = textract.analyze_expense(
            DocumentLocation={'S3Object': {'Bucket': bucket, 'Name': key}}
        )

        # 2. Refine with Gemini (replaces the old GPT-4o call)
        textract_summary = extract_textract_summary(textract_response)
        refined_data = call_gemini(textract_summary)

        # 3. Ensure the data contains the required fields
        final_payload = {
            "items": refined_data.get("items", []),
            "subtotal": refined_data.get("subtotal", 0),
            "tax": refined_data.get("tax", 0),
            "total": refined_data.get("total", 0),
        }

        # Write final_payload to DynamoDB
        ocr_table.put_item(Item={
            'pk': f"OBJECTKEY#{key}",
            'sk': 'OCR#RESULT',
            'status': 'PARSED',
            'parsed': final_payload,  # Store the cleaned payload
            'objectKey': key,
            'updatedAt': int(time.time()),
        })

    except Exception as exc:
        # Without this, a Textract/Gemini failure leaves no DynamoDB item at
        # all, and the frontend's poller in import.js just spins until it
        # times out with no useful error. Write a FAILED status instead so
        # the UI can show "Parsing failed" immediately.
        print(f"OCR processing failed for s3://{bucket}/{key}: {exc}")
        ocr_table.put_item(Item={
            'pk': f"OBJECTKEY#{key}",
            'sk': 'OCR#RESULT',
            'status': 'FAILED',
            'error': str(exc),
            'objectKey': key,
            'updatedAt': int(time.time()),
        })
        raise

    return {"statusCode": 200}
