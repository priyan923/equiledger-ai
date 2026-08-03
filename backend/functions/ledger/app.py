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
    # BACKLOG (Person 2, task 9 - flagged, not building this week): there is no
    # edit/delete endpoint for transactions even though the table structurally
    # supports it (pk/sk lookup would be trivial). Noted for the post-launch
    # backlog rather than squeezed into this week's scope.
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


def compute_totals(user_id):
    # Fix for the totals cap: list_transactions() is deliberately capped at 50
    # items for the displayed list, but totals must reflect ALL of the user's
    # transactions or "spent"/"income" on the dashboard silently drifts away
    # from reality for any user with more than 50 logged transactions. This
    # paginates through every page via LastEvaluatedKey and sums independently
    # of the list view's Limit.
    spent = Decimal(0)
    income = Decimal(0)
    exclusive_start_key = None

    while True:
        query_kwargs = {
            "KeyConditionExpression": "pk = :pk AND begins_with(sk, :prefix)",
            "ExpressionAttributeValues": {
                ":pk": f"USER#{user_id}",
                ":prefix": "TXN#",
            },
        }
        if exclusive_start_key:
            query_kwargs["ExclusiveStartKey"] = exclusive_start_key

        result = table.query(**query_kwargs)

        for item in result.get("Items", []):
            amount = Decimal(str(item.get("amount", 0)))
            if amount > 0:
                spent += amount
            elif amount < 0:
                income += abs(amount)

        exclusive_start_key = result.get("LastEvaluatedKey")
        if not exclusive_start_key:
            break

    return {"spent": spent, "income": income}


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
        totals = compute_totals(user_id)
        return response(200, {"items": items, "totals": totals})

    if method == "POST":
        payload = body(event)
        required = ["description", "amount"]
        missing = [key for key in required if key not in payload]
        if missing:
            return response(400, {"message": f"Missing required field(s): {', '.join(missing)}"})
        return response(201, {"item": put_transaction(user_id, payload)})

    return response(405, {"message": "Method not allowed"})