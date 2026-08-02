import json
import os
import urllib.request
import urllib.error
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')


def decimal_default(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def handler(event, context):
    # 1. Handle CORS Preflight
    if event.get('httpMethod') == 'OPTIONS':
        return _build_response(200, "OK")

    try:
        # Resolve table names cleanly
        ocr_table = dynamodb.Table(os.environ.get('OCR_TABLE', os.environ.get('OCR_RESULTS_TABLE', '')))
        receipts_table = dynamodb.Table(os.environ.get('RECEIPTS_TABLE', ''))

        body = json.loads(event.get('body', '{}'))
        user_prompt = body.get('prompt', '')

        if not user_prompt:
            return _build_response(400, {"reply": "No prompt provided."})

        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            return _build_response(500, {"reply": "Backend Error: GEMINI_API_KEY environment variable is missing or empty."})
        
        # Identify Cognito User Identity
        user_id = 'test-user'
        if 'requestContext' in event and 'authorizer' in event['requestContext']:
            if 'claims' in event['requestContext']['authorizer']:
                user_id = event['requestContext']['authorizer']['claims'].get('sub', 'test-user')

        user_files_data = []

        try:
            # Gather user receipt metadata mapping
            receipts_response = receipts_table.query(
                KeyConditionExpression=Key('pk').eq(f"USER#{user_id}")
            )
            user_receipt_records = receipts_response.get('Items', [])

            for record in user_receipt_records:
                obj_key = record.get('objectKey') or record.get('sk', '').replace('RECEIPT#', '')
                if not obj_key:
                    continue
                
                ocr_response = ocr_table.get_item(
                    Key={'pk': f"OBJECTKEY#{obj_key}", 'sk': 'OCR#RESULT'}
                )
                if 'Item' in ocr_response:
                    item_data = ocr_response['Item']
                    user_files_data.append({
                        "fileName": item_data.get("objectKey"),
                        "status": item_data.get("status"),
                        "data": item_data.get("parsed")
                    })
        except Exception as db_err:
            print(f"DynamoDB querying bypass log: {db_err}")

        context_str = json.dumps(user_files_data,default=decimal_default) if user_files_data else "No processed financial receipts found."

        system_instruction = f"""
        You are EquiLedgerAI, a highly intelligent financial assistant. 
        Keep answers brief (1-3 sentences).
        
        Here is the user's real parsed receipt data extracted via text extraction:
        {context_str}
        
        Answer their questions using this accurate personal data.
        """
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": user_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_instruction}]}
        }
        
        headers = {'Content-Type': 'application/json'}
        req = urllib.request.Request(
            url, 
            data=json.dumps(payload,default=decimal_default).encode('utf-8'), 
            headers=headers, 
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                result = json.loads(response.read().decode('utf-8'))
                
                # Safely parse text fields without throwing key/index errors if Gemini objects change
                try:
                    reply_text = result['candidates'][0]['content']['parts'][0]['text']
                except (KeyError, IndexError):
                    reply_text = f"AI Structure Error: Received unexpected response format format. Raw response: {json.dumps(result,default=decimal_default)}"
                
                return _build_response(200, {"reply": reply_text})
                
        except urllib.error.HTTPError as http_err:
            error_body = http_err.read().decode('utf-8', errors='replace')
            return _build_response(500, {"reply": f"Google Gemini API HTTP {http_err.code} Error: {error_body}"})

    except Exception as e:
        return _build_response(500, {"reply": f"Python Lambda Internal Error: {str(e)}"})

def _build_response(status_code, body_content):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
        'body': json.dumps(body_content,default=decimal_default) if isinstance(body_content, dict) else body_content
    }