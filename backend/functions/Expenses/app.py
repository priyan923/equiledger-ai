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
            "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
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
    return json.loads(event["body"], parse_float=Decimal)


def create_expense(user_id, payload):
    required = ["groupId", "description", "amount", "paidBy"]
    missing = [f for f in required if f not in payload]
    if missing:
        return None, f"Missing required field(s): {', '.join(missing)}"

    now = int(time.time())
    expense_id = str(uuid4())
    group_id = payload["groupId"]
    sk = f"EXPENSE#{now}#{expense_id}"

    item = {
        "pk": f"GROUP#{group_id}",
        "sk": sk,
        "expenseId": expense_id,
        "groupId": group_id,
        "description": payload["description"],
        "amount": Decimal(str(payload["amount"])),
        "paidBy": payload["paidBy"],
        "splitType": payload.get("splitType", "equal"),
        "createdBy": user_id,
        "createdAt": now,
    }
    table.put_item(Item=item)
    return item, None


def list_expenses(group_id):
    result = table.query(
        KeyConditionExpression="pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues={":pk": f"GROUP#{group_id}", ":prefix": "EXPENSE#"},
        ScanIndexForward=False,
    )
    return result.get("Items", [])


def delete_expense(group_id, sk):
    table.delete_item(Key={"pk": f"GROUP#{group_id}", "sk": sk})


def handler(event, context):
    method = event.get("httpMethod", "GET")
    user_id = principal(event)

    if method == "OPTIONS":
        return response(204, {})

    if method == "POST":
        payload = request_body(event)
        item, error = create_expense(user_id, payload)
        if error:
            return response(400, {"message": error})
        return response(201, {"item": item})

    if method == "GET":
        params = event.get("queryStringParameters") or {}
        group_id = params.get("groupId")
        if not group_id:
            return response(400, {"message": "groupId query parameter is required"})
        return response(200, {"items": list_expenses(group_id)})

    if method == "DELETE":
        payload = request_body(event)
        group_id = payload.get("groupId")
        sk = payload.get("sk")
        if not group_id or not sk:
            return response(400, {"message": "groupId and sk are required"})
        delete_expense(group_id, sk)
        return response(200, {"message": "Expense deleted"})

    return response(405, {"message": "Method not allowed"}) 