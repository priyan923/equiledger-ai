import json
import os

ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")

def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
            "Content-Type": "application/json",
        },
        "body": json.dumps(body),
    }

def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return response(204, {})

    # Log the incoming event to CloudWatch so we can debug if claims are missing!
    print(f"Incoming Event: {json.dumps(event)}")

    # API Gateway extracts the validated token claims and passes them here
    claims = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("claims", {})
    )
    
    # Extract the true email from the authenticated user
    email = claims.get("email", "user@example.com")
    
    return response(
        200,
        {
            "sub": claims.get("sub"),
            "email": email,
            # Fall back to the first part of their email if they have no explicit name
            "name": claims.get("name", email.split('@')[0]), 
            "picture": claims.get("picture"),
        },
    )