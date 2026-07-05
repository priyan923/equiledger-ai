import json
import os
import time
from decimal import Decimal
from uuid import uuid4

import boto3


dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["LEDGER_TABLE"])
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


def body(event):
    if not event.get("body"):
        return {}
    return json.loads(event["body"], parse_float=Decimal)


def put_transaction(user_id, payload):
    now = int(time.time())
    item = {
        "pk": f"USER#{user_id}",
        "sk": f"TXN#{now}#{uuid4()}",
        "description": payload["description"],
        "amount": Decimal(str(payload["amount"])),
        "category": payload.get("category", "Uncategorized"),
        "account": payload.get("account", "You"),
        "mode": payload.get("mode", "personal"),
        "status": payload.get("status", "Cleared"),
        "createdAt": now,
    }
    table.put_item(Item=item)
    return item


def list_transactions(user_id):
    result = table.query(
        KeyConditionExpression="pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues={":pk": f"USER#{user_id}", ":prefix": "TXN#"},
        ScanIndexForward=False,
        Limit=50,
    )
    return result.get("Items", [])


def activity_feed(user_id):
    items = list_transactions(user_id)[:10]
    return [
        {
            "title": item.get("description"),
            "amount": item.get("amount"),
            "category": item.get("category"),
            "createdAt": item.get("createdAt"),
            "mode": item.get("mode"),
        }
        for item in items
    ]


def handler(event, context):
    method = event.get("httpMethod", "GET")
    path = event.get("path", "")
    user_id = principal(event)

    if method == "OPTIONS":
        return response(204, {})

    if path.endswith("/activity"):
        return response(200, {"items": activity_feed(user_id)})

    if method == "GET":
        items = list_transactions(user_id)
        totals = {
            "spent": sum(Decimal(str(i.get("amount", 0))) for i in items if Decimal(str(i.get("amount", 0))) > 0),
            "income": sum(abs(Decimal(str(i.get("amount", 0)))) for i in items if Decimal(str(i.get("amount", 0))) < 0),
        }
        return response(200, {"items": items, "totals": totals})

    if method == "POST":
        payload = body(event)
        required = ["description", "amount"]
        missing = [key for key in required if key not in payload]
        if missing:
            return response(400, {"message": f"Missing required field(s): {', '.join(missing)}"})
        return response(201, {"item": put_transaction(user_id, payload)})

    return response(405, {"message": "Method not allowed"})
