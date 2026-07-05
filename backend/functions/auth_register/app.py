import base64
import hashlib
import hmac
import json
import os

import boto3
from botocore.exceptions import ClientError

cognito = boto3.client("cognito-idp")

CLIENT_ID = os.environ["COGNITO_CLIENT_ID"]
CLIENT_SECRET = os.environ.get("COGNITO_CLIENT_SECRET", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")


def get_cognito_username(email):
    """Converts an email address into a safe string format for Cognito user pool alias handling."""
    return email.strip().lower().replace("@", "_").replace(".", "-")


def calculate_secret_hash(username):
    """Computes the mandatory HMAC-SHA256 signature required by secret-enabled app clients."""
    message = username + CLIENT_ID
    dig = hmac.new(
        str(CLIENT_SECRET).encode("utf-8"),
        str(message).encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.b64encode(dig).decode()


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


def request_body(event):
    if not event.get("body"):
        return {}
    return json.loads(event["body"])


def sign_up(payload):
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""
    name = (payload.get("name") or "").strip()

    if not email or not password:
        return response(400, {"message": "Email and password are required."})

    # Convert the email format into a safe structural username string
    cognito_username = get_cognito_username(email)

    attributes = [{"Name": "email", "Value": email}]
    if name:
        attributes.append({"Name": "name", "Value": name})

    try:
        result = cognito.sign_up(
            ClientId=CLIENT_ID,
            SecretHash=calculate_secret_hash(cognito_username),
            Username=cognito_username,
            Password=password,
            UserAttributes=attributes,
        )
    except cognito.exceptions.UsernameExistsException:
        return response(
            409, {"message": "An account with this email already exists."}
        )
    except cognito.exceptions.InvalidPasswordException as exc:
        return response(
            400, {"message": f"Password does not meet requirements: {exc}"}
        )
    except ClientError as exc:
        return response(
            400,
            {
                "message": exc.response.get("Error", {}).get(
                    "Message", "Sign-up failed."
                )
            },
        )

    return response(
        201,
        {
            "message": "Account created. Check your email for a verification code.",
            "userSub": result.get("UserSub"),
            "confirmed": result.get("UserConfirmed", False),
        },
    )


def confirm_sign_up(payload):
    email = (payload.get("email") or "").strip()
    code = (payload.get("code") or "").strip()

    if not email or not code:
        return response(
            400, {"message": "Email and verification code are required."}
        )

    cognito_username = get_cognito_username(email)

    try:
        cognito.confirm_sign_up(
            ClientId=CLIENT_ID,
            SecretHash=calculate_secret_hash(cognito_username),
            Username=cognito_username,
            ConfirmationCode=code,
        )
    except cognito.exceptions.CodeMismatchException:
        return response(400, {"message": "Incorrect verification code."})
    except cognito.exceptions.ExpiredCodeException:
        return response(
            400, {"message": "Verification code expired. Request a new one."}
        )
    except cognito.exceptions.NotAuthorizedException:
        return response(400, {"message": "Account is already confirmed."})
    except ClientError as exc:
        return response(
            400,
            {
                "message": exc.response.get("Error", {}).get(
                    "Message", "Confirmation failed."
                )
            },
        )

    return response(200, {"message": "Account verified. You can now sign in."})


def resend_code(payload):
    email = (payload.get("email") or "").strip()
    if not email:
        return response(400, {"message": "Email is required."})

    cognito_username = get_cognito_username(email)

    try:
        cognito.resend_confirmation_code(
            ClientId=CLIENT_ID,
            SecretHash=calculate_secret_hash(cognito_username),
            Username=cognito_username,
        )
    except ClientError as exc:
        return response(
            400,
            {
                "message": exc.response.get("Error", {}).get(
                    "Message", "Could not resend code."
                )
            },
        )

    return response(200, {"message": "Verification code resent."})


def login(payload):
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""

    if not email or not password:
        return response(400, {"message": "Email and password are required."})

    cognito_username = get_cognito_username(email)

    try:
        result = cognito.initiate_auth(
            ClientId=CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": cognito_username,
                "PASSWORD": password,
                "SECRET_HASH": calculate_secret_hash(cognito_username),
            },
        )
        auth_result = result.get("AuthenticationResult", {})

        return response(
            200,
            {
                "tokens": {
                    "accessToken": auth_result.get("AccessToken"),
                    "idToken": auth_result.get("IdToken"),
                    "expiresIn": auth_result.get("ExpiresIn"),
                    "tokenType": auth_result.get("TokenType"),
                }
            },
        )
    except cognito.exceptions.NotAuthorizedException:
        return response(401, {"message": "Incorrect email or password."})
    except cognito.exceptions.UserNotConfirmedException:
        return response(
            403,
            {
                "message": "Account not verified. Please verify your email first."
            },
        )
    except ClientError as exc:
        return response(
            400,
            {
                "message": exc.response.get("Error", {}).get(
                    "Message", "Login failed."
                )
            },
        )


def handler(event, context):
    if event.get("httpMethod") == "OPTIONS":
        return response(204, {})

    path = event.get("path", "")
    payload = request_body(event)

    if path.endswith("/auth/register"):
        return sign_up(payload)
    if path.endswith("/auth/confirm"):
        return confirm_sign_up(payload)
    if path.endswith("/auth/resend-code"):
        return resend_code(payload)
    if path.endswith("/auth/login"):
        return login(payload)

    return response(404, {"message": "Not found"})