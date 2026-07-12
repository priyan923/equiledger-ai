import json
import os
import time
from decimal import Decimal
from uuid import uuid4

import boto3



dynamodb = boto3.resource("dynamodb")
ledger_table = dynamodb.Table(os.environ["LEDGER_TABLE"])
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body, default=str),
    }


def decimalize(value):
    if isinstance(value, list):
        return [decimalize(item) for item in value]
    if isinstance(value, dict):
        return {key: decimalize(item) for key, item in value.items()}
    if isinstance(value, float):
        return Decimal(str(value))
    return value


def request_body(event):
    if not event.get("body"):
        return {}
    return json.loads(event["body"], parse_float=Decimal)


def principal(event):
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )
    return claims.get("sub") or "local-development-user"


def update_member_balance(group_id, friend_id, delta, now):
    ledger_table.update_item(
        Key={
            "pk": f"GROUP#{group_id}",
            "sk": f"BALANCE#{friend_id}",
        },
        UpdateExpression=(
            "SET updatedAt = :updatedAt, memberId = :memberId "
            "ADD balance :delta"
        ),
        ExpressionAttributeValues={
            ":delta": Decimal(str(delta)),
            ":updatedAt": now,
            ":memberId": friend_id,
        },
        ReturnValues="UPDATED_NEW",
    )


def put_split_snapshot(group_id, split_id, payload, user_id, now):
    ledger_table.put_item(
        Item={
            "pk": f"GROUP#{group_id}",
            "sk": f"SPLIT#{now}#{split_id}",
            "splitId": split_id,
            "committedBy": user_id,
            "createdAt": now,
            "payload": decimalize(payload),
        }
    )


def put_activity(group_id, split_id, payload, now):
    names = [balance["name"] for balance in payload.get("balances", []) if balance.get("friendId") != payload.get("payerId")]
    total = Decimal(str(payload.get("total", 0)))
    log = f"Finalized {payload.get('receiptId', 'group receipt')} split for {', '.join(names)}. Total: ₹{int(total)}."
    ledger_table.put_item(
        Item={
            "pk": "ACTIVITY#GLOBAL",
            "sk": f"LOG#{now}#{split_id}",
            "groupId": group_id,
            "splitId": split_id,
            "message": log,
            "createdAt": now,
        }
    )
    ledger_table.put_item(
        Item={
            "pk": f"GROUP#{group_id}",
            "sk": f"ACTIVITY#{now}#{split_id}",
            "groupId": group_id,
            "splitId": split_id,
            "message": log,
            "createdAt": now,
        }
    )
    return log


def commit_split(payload, user_id):
    now = int(time.time())
    split_id = str(uuid4())
    group_id = payload["groupId"]
    payer_id = payload["payerId"]

    for balance in payload.get("balances", []):
        friend_id = balance["friendId"]
        final_balance = Decimal(str(balance.get("finalBalance", 0)))
        if final_balance == 0:
            continue
        if friend_id == payer_id:
            update_member_balance(group_id, friend_id, final_balance, now)
        else:
            update_member_balance(group_id, friend_id, -final_balance, now)

    put_split_snapshot(group_id, split_id, payload, user_id, now)
    log = put_activity(group_id, split_id, payload, now)

    return {
        "splitId": split_id,
        "groupId": group_id,
        "activityLog": log,
        "updatedAt": now,
    }


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return response(204, {})

    if event.get("httpMethod") != "POST":
        return response(405, {"message": "Method not allowed"})

    payload = request_body(event)
    missing = [field for field in ["groupId", "payerId", "balances", "assignments"] if field not in payload]
    if missing:
        return response(400, {"message": f"Missing required field(s): {', '.join(missing)}"})

    result = commit_split(payload, principal(event))
    return response(201, result)
