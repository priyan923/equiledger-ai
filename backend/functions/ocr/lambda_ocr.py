import json
import os
import boto3
import base64
from google import genai

# Connect to AWS and Gemini
s3_client = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")

# Initialize the new Google GenAI client
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"]) 

OCR_TABLE_NAME = os.environ["OCR_RESULTS_TABLE"]
ocr_table = dynamodb.Table(OCR_TABLE_NAME)

def handler(event, context):
    try:
        # 1. Get the uploaded file info from the S3 trigger event
        record = event['Records'][0]['s3']
        bucket = record['bucket']['name']
        key = record['object']['key']
        
        print(f"Processing new upload: {key}")

        # 2. Download the file from S3 into Lambda's memory
        s3_response = s3_client.get_object(Bucket=bucket, Key=key)
        file_bytes = s3_response['Body'].read()
        
        # 3. Determine the correct MIME type for Gemini
        extension = key.split('.')[-1].lower()
        mime_type = "image/jpeg" if extension in ['jpg', 'jpeg'] else (f"application/pdf" if extension == 'pdf' else f"image/{extension}")
        
        # 4. Encode the image to Base64 so Gemini can "see" it
        base64_data = base64.b64encode(file_bytes).decode('utf-8')
        
        # 5. Ask Gemini 2.5 Flash to read the receipt and output JSON
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                {"type": "image", "data": base64_data, "mime_type": mime_type},
                {"type": "text", "text": "You are an expert receipt parser. Extract the items, subtotal, tax, and total from the image. Always return valid JSON matching this schema: {\"items\": [{\"name\": \"item name\", \"amount\": 12.34}], \"subtotal\": 10.00, \"tax\": 2.34, \"total\": 12.34}."}
            ]
        )
        
        # 6. Extract the refined JSON data
        # Gemini wraps JSON blocks in markdown (```json ... ```), so we strip it.
        raw_text = response.text.replace('```json', '').replace('```', '').strip()
        refined_data = json.loads(raw_text)
        
        final_payload = {
            "items": refined_data.get("items", []),
            "subtotal": refined_data.get("subtotal", 0),
            "tax": refined_data.get("tax", 0),
            "total": refined_data.get("total", 0)
        }
        
        # 7. Save the successful result to DynamoDB
        ocr_table.put_item(Item={
            'pk': f"OBJECTKEY#{key}",
            'sk': 'OCR#RESULT',
            'status': 'PARSED',
            'parsed': final_payload,
            'objectKey': key
        })
        
        return {"statusCode": 200, "body": json.dumps("Success")}

    except Exception as e:
        print(f"Error processing {key}: {str(e)}")
        # Log error to DynamoDB so the UI knows it failed
        if 'key' in locals():
            ocr_table.put_item(Item={
                'pk': f"OBJECTKEY#{key}",
                'sk': 'OCR#RESULT',
                'status': 'ERROR',
                'error_message': str(e),
                'objectKey': key
            })
        raise e