import json
import os
import time
import uuid

import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["LEDGER_TABLE"])


def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*"
        },
        "body": json.dumps(body)
    }


def get_user_email(event):
    return (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
        .get("email")
    )

def create_group(event):

    email = get_user_email(event)

    body = json.loads(event.get("body") or "{}")

    group_name = body.get("groupName", "").strip()
    members = body.get("members", [])

    if not group_name:
        return response(400, {"message": "Group name required"})

    group_id = str(uuid.uuid4())

    item = {
        "pk": f"USER#{email}",
        "sk": f"GROUP#{group_id}",
        "groupId": group_id,
        "groupName": group_name,
        "members": members,
        "createdAt": int(time.time())
    }

    table.put_item(Item=item)

    return response(
        201,
        {
            "groupId": group_id
        }
    )


def list_groups(event):

    email = get_user_email(event)

    result = table.query(
        KeyConditionExpression=
        boto3.dynamodb.conditions.Key("pk").eq(f"USER#{email}") &
        boto3.dynamodb.conditions.Key("sk").begins_with("GROUP#")
    )

    groups = []

    for item in result.get("Items", []):

        groups.append({
            "groupId": item["groupId"],
            "groupName": item["groupName"],
            "members": item["members"]
        })

    return response(200, groups)

def get_group(event):

    email = get_user_email(event)

    group_id = event["pathParameters"]["groupId"]

    result = table.get_item(
        Key={
            "pk": f"USER#{email}",
            "sk": f"GROUP#{group_id}"
        }
    )

    item = result.get("Item")

    if not item:
        return response(
            404,
            {
                "message": "Group not found"
            }
        )

    return response(
        200,
        {
            "groupId": item["groupId"],
            "groupName": item["groupName"],
            "members": item["members"]
        }
    )


def handler(event, context):

    method = event["httpMethod"]

    if method == "GET":

        path = event.get("resource", "")

        if path == "/groups/{groupId}":
            return get_group(event)

        return list_groups(event)

    if method == "POST":
        return create_group(event)

    return response(405, {"message": "Method not allowed"})
