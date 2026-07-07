import json
import os
import time
from uuid import uuid4

import boto3


s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["RECEIPTS_TABLE"])
ocr_table = dynamodb.Table(os.environ["OCR_RESULTS_TABLE"])
BUCKET = os.environ["RECEIPTS_BUCKET"]
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, default=str),
    }


def principal(event):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )
    return claims.get("sub") or "local-development-user"


def request_body(event):
    if not event.get("body"):
        return {}
    return json.loads(event["body"])


def upload_url(user_id, payload):
    file_name = payload.get("fileName", "receipt.bin")
    content_type = payload.get("contentType", "application/octet-stream")
    object_key = f"users/{user_id}/receipts/{int(time.time())}-{uuid4()}-{file_name}"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": object_key, "ContentType": content_type},
        ExpiresIn=900,
    )
    return {"uploadUrl": url, "objectKey": object_key}


def create_receipt(user_id, payload):
    now = int(time.time())
    item = {
        "pk": f"USER#{user_id}",
        "sk": f"RECEIPT#{now}#{uuid4()}",
        "objectKey": payload["objectKey"],
        "fileName": payload.get("fileName", payload["objectKey"].split("/")[-1]),
        "status": "UPLOADED",
        "category": payload.get("category", "Unsorted"),
        "amount": payload.get("amount"),
        "mode": payload.get("mode", "personal"),
        "groupId": payload.get("groupId"),
        "createdAt": now,
    }
    table.put_item(Item=item)
    return item


def list_receipts(user_id):
    result = table.query(
        KeyConditionExpression="pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues={":pk": f"USER#{user_id}", ":prefix": "RECEIPT#"},
        ScanIndexForward=False,
        Limit=50,
    )
    return result.get("Items", [])


def get_ocr_status(object_key):
    result = ocr_table.get_item(Key={"pk": f"OBJECTKEY#{object_key}", "sk": "OCR#RESULT"})
    item = result.get("Item")
    if not item:
        return {"status": "PROCESSING"}
    # --- Ensure strict schema for the Split team ---
    return {
        "status": item.get("status", "PARSED"),
        "parsed": item.get("parsed"),
        "objectKey": item.get("objectKey"),
        "createdAt": item.get("createdAt"),
        "error": item.get("error"),
    }


def handler(event, context):
    method = event.get("httpMethod", "GET")
    path = event.get("path", "")
    user_id = principal(event)

    if method == "OPTIONS":
        return response(204, {})

    if path.endswith("/upload-url") and method == "POST":
        return response(200, upload_url(user_id, request_body(event)))

    if path.endswith("/receipts/status") and method == "GET":
        object_key = (event.get("queryStringParameters") or {}).get("objectKey")
        if not object_key:
            return response(400, {"message": "objectKey query parameter is required"})
        return response(200, get_ocr_status(object_key))

    if method == "POST":
        payload = request_body(event)
        if "objectKey" not in payload:
            return response(400, {"message": "objectKey is required"})
        return response(201, {"item": create_receipt(user_id, payload)})

    if method == "GET":
        return response(200, {"items": list_receipts(user_id)})

    return response(405, {"message": "Method not allowed"})
