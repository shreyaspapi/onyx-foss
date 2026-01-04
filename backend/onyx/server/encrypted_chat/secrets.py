"""API endpoints for encrypted user secrets (API keys)."""

import base64
from typing import List, Callable

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from fastapi import Response
from fastapi import status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.orm import Session

from onyx.auth.users import current_user
from onyx.configs.app_configs import AUTH_RATE_LIMITING_ENABLED
from onyx.db.engine import get_session
from onyx.db.encrypted_chat import (
    store_encrypted_secret,
    get_encrypted_secret,
    delete_encrypted_secret,
    has_encrypted_secret,
)
from onyx.db.models import User
from onyx.server.encrypted_chat.models import (
    StoreSecretRequest,
    EncryptedSecretResponse,
    SecretStoredResponse,
)


router = APIRouter(prefix="/encrypted-secrets", tags=["Encrypted Secrets"])


async def encrypted_rate_limit_key(request: Request) -> str:
    """Rate limit key for encrypted endpoints - stricter than normal."""
    ip_part = request.client.host if request.client else "unknown"
    ua_part = request.headers.get("user-agent", "none").replace(" ", "_")
    return f"encrypted-{ip_part}-{ua_part}"


def get_encrypted_rate_limiters() -> List[Callable]:
    """Get rate limiters for encrypted endpoints.
    
    These are stricter than normal rate limits to prevent brute-force attacks
    on encrypted data.
    """
    if not AUTH_RATE_LIMITING_ENABLED:
        return []

    return [
        Depends(
            RateLimiter(
                times=10,  # 10 requests
                seconds=60,  # per minute
                identifier=encrypted_rate_limit_key,
            )
        )
    ]


@router.post("", response_model=SecretStoredResponse)
async def store_secret(
    request: StoreSecretRequest,
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> SecretStoredResponse:
    """Store a user's encrypted API key.

    The encrypted value is stored as-is. The server cannot decrypt it.
    Only the client with the user's password can decrypt the value.
    """
    try:
        encrypted_value = base64.b64decode(request.encrypted_value)
        salt = base64.b64decode(request.salt)
        iv = base64.b64decode(request.iv)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 encoding in request",
        )

    store_encrypted_secret(
        user_id=user.id,
        secret_type=request.secret_type,
        encrypted_value=encrypted_value,
        salt=salt,
        iv=iv,
        encryption_version=request.version,
        db_session=db_session,
    )

    return SecretStoredResponse(
        success=True,
        secret_type=request.secret_type,
    )


@router.get(
    "/{secret_type}",
    response_model=EncryptedSecretResponse,
    dependencies=get_encrypted_rate_limiters(),
)
async def get_secret(
    secret_type: str,
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> EncryptedSecretResponse:
    """Retrieve an encrypted secret blob for client-side decryption."""
    secret = get_encrypted_secret(
        user_id=user.id,
        secret_type=secret_type,
        db_session=db_session,
    )

    if secret is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No secret found for type: {secret_type}",
        )

    return EncryptedSecretResponse(
        secret_type=secret.secret_type,
        encrypted_value=base64.b64encode(secret.encrypted_value).decode("utf-8"),
        salt=base64.b64encode(secret.salt).decode("utf-8"),
        iv=base64.b64encode(secret.iv).decode("utf-8"),
        version=secret.encryption_version,
    )


@router.head("/{secret_type}")
async def check_secret_exists(
    secret_type: str,
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> Response:
    """Check if an encrypted secret exists for the given type.

    Returns 200 if exists, 404 if not.
    """
    exists = has_encrypted_secret(
        user_id=user.id,
        secret_type=secret_type,
        db_session=db_session,
    )

    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No secret found for type: {secret_type}",
        )

    return Response(status_code=status.HTTP_200_OK)


@router.delete("/{secret_type}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_secret(
    secret_type: str,
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> None:
    """Delete an encrypted secret."""
    deleted = delete_encrypted_secret(
        user_id=user.id,
        secret_type=secret_type,
        db_session=db_session,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No secret found for type: {secret_type}",
        )
