import json
import os
import time
import urllib.request
import urllib.error
import base64
import boto3
from decimal import Decimal

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

# Get the table name from Lambda environment variables
OCR_TABLE_NAME = os.environ["OCR_RESULTS_TABLE"]
ocr_table = dynamodb.Table(OCR_TABLE_NAME)

# --- Gemini Configuration ---
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
)

def get_mime_type(key):
    """Determine the file type for Gemini so it knows how to read the image/PDF."""
    key_lower = key.lower()
    if key_lower.endswith('.pdf'):
        return 'application/pdf'
    elif key_lower.endswith('.png'):
        return 'image/png'
    elif key_lower.endswith('.webp'):
        return 'image/webp'
    else:
        return 'image/jpeg' 

def call_gemini_vision(base64_data, mime_type):
    """Send the raw image straight to Gemini and get back clean, structured receipt JSON."""
    prompt = (
        "You are a receipt processor. Read the attached image/document "
        "and return ONLY a raw JSON object (no markdown fences, no commentary) "
        "with this exact shape: "
        '{"items": [{"name": string, "amount": number}], '
        '"subtotal": number, "tax": number, "total": number}. '
        "If a field is missing, make a best-effort estimate from the line items so "
        "the numbers stay consistent. If you cannot read it, return 0s."
    )

    request_payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": base64_data
                    }
                }
            ]
        }],
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
    return json.loads(text, parse_float=Decimal)

def handler(event, context):
    record = event['Records'][0]['s3']
    bucket = record['bucket']['name']
    key = record['object']['key']

    try:
        # 1. Fetch the raw image file directly from S3
        response = s3.get_object(Bucket=bucket, Key=key)
        file_content = response['Body'].read()
        
        # 2. Convert to Base64 so we can send it over the web to Google
        base64_data = base64.b64encode(file_content).decode('utf-8')
        mime_type = get_mime_type(key)

        # 3. Let Gemini's built-in vision model do all the heavy lifting
        refined_data = call_gemini_vision(base64_data, mime_type)

        # 4. Ensure the data contains the required fields
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
            'parsed': final_payload,  
            'objectKey': key,
            'updatedAt': int(time.time()),
        })

    except Exception as exc:
        print(f"Vision processing failed for s3://{bucket}/{key}: {exc}")
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