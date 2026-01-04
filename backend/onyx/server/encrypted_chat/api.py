"""API endpoints for encrypted chat sessions."""

import base64
from typing import List, Callable
from uuid import UUID

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Request
from fastapi import status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.orm import Session

from onyx.auth.users import current_user
from onyx.configs.app_configs import AUTH_RATE_LIMITING_ENABLED
from onyx.db.engine import get_session
from onyx.db.encrypted_chat import (
    create_encrypted_session,
    update_encrypted_session,
    get_encrypted_session,
    list_encrypted_sessions,
    delete_encrypted_session,
)
from onyx.db.models import User
from onyx.server.encrypted_chat.models import (
    CreateEncryptedSessionRequest,
    UpdateEncryptedSessionRequest,
    EncryptedSessionResponse,
    EncryptedSessionListItem,
)


router = APIRouter(prefix="/encrypted-sessions", tags=["Encrypted Chat"])


async def encrypted_session_rate_limit_key(request: Request) -> str:
    """Rate limit key for encrypted session endpoints."""
    ip_part = request.client.host if request.client else "unknown"
    ua_part = request.headers.get("user-agent", "none").replace(" ", "_")
    return f"enc-session-{ip_part}-{ua_part}"


def get_session_rate_limiters() -> List[Callable]:
    """Get rate limiters for encrypted session endpoints."""
    if not AUTH_RATE_LIMITING_ENABLED:
        return []

    return [
        Depends(
            RateLimiter(
                times=30,  # 30 requests
                seconds=60,  # per minute
                identifier=encrypted_session_rate_limit_key,
            )
        )
    ]


def _session_to_response(session) -> EncryptedSessionResponse:
    """Convert a database session to an API response."""
    return EncryptedSessionResponse(
        session_id=session.id,
        encrypted_data=base64.b64encode(session.encrypted_data).decode("utf-8"),
        encryption_version=session.encryption_version,
        created_at=session.created_at,
        updated_at=session.updated_at,
        encrypted_name=(
            base64.b64encode(session.encrypted_name).decode("utf-8")
            if session.encrypted_name
            else None
        ),
    )


def _session_to_list_item(session) -> EncryptedSessionListItem:
    """Convert a database session to a list item."""
    return EncryptedSessionListItem(
        session_id=session.id,
        encrypted_name=(
            base64.b64encode(session.encrypted_name).decode("utf-8")
            if session.encrypted_name
            else None
        ),
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.post("", response_model=EncryptedSessionResponse)
async def create_session(
    request: CreateEncryptedSessionRequest,
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> EncryptedSessionResponse:
    """Create a new encrypted chat session.

    The encrypted_data is stored as-is without any server-side processing.
    The server cannot decrypt this data.
    """
    try:
        encrypted_data = base64.b64decode(request.encrypted_data)
        encrypted_name = (
            base64.b64decode(request.encrypted_name)
            if request.encrypted_name
            else None
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 encoding in request",
        )

    session = create_encrypted_session(
        user_id=user.id,
        encrypted_data=encrypted_data,
        encryption_version=request.encryption_version,
        encrypted_name=encrypted_name,
        db_session=db_session,
    )

    return _session_to_response(session)


@router.put("/{session_id}", response_model=EncryptedSessionResponse)
async def update_session(
    session_id: UUID,
    request: UpdateEncryptedSessionRequest,
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> EncryptedSessionResponse:
    """Update an encrypted chat session."""
    try:
        encrypted_data = base64.b64decode(request.encrypted_data)
        encrypted_name = (
            base64.b64decode(request.encrypted_name)
            if request.encrypted_name
            else None
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid base64 encoding in request",
        )

    session = update_encrypted_session(
        session_id=session_id,
        user_id=user.id,
        encrypted_data=encrypted_data,
        db_session=db_session,
        encrypted_name=encrypted_name,
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    return _session_to_response(session)


@router.get("/{session_id}", response_model=EncryptedSessionResponse)
async def get_session(
    session_id: UUID,
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> EncryptedSessionResponse:
    """Retrieve an encrypted session blob.

    The client is responsible for decrypting the data.
    """
    session = get_encrypted_session(
        session_id=session_id,
        user_id=user.id,
        db_session=db_session,
    )

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    return _session_to_response(session)


@router.get("", response_model=list[EncryptedSessionListItem])
async def list_sessions(
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> list[EncryptedSessionListItem]:
    """List encrypted sessions with encrypted names.

    The client is responsible for decrypting the session names.
    """
    sessions = list_encrypted_sessions(
        user_id=user.id,
        db_session=db_session,
    )

    return [_session_to_list_item(s) for s in sessions]


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    user: User = Depends(current_user),
    db_session: Session = Depends(get_session),
) -> None:
    """Delete an encrypted session."""
    deleted = delete_encrypted_session(
        session_id=session_id,
        user_id=user.id,
        db_session=db_session,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )
