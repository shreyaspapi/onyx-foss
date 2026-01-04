"""Database operations for encrypted chat sessions and secrets."""

from uuid import UUID
from uuid import uuid4
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from onyx.db.models import EncryptedChatSession, EncryptedUserSecret


# ============================================================================
# Encrypted Chat Session Operations
# ============================================================================


def create_encrypted_session(
    user_id: UUID,
    encrypted_data: bytes,
    encryption_version: int,
    encrypted_name: bytes | None,
    db_session: Session,
) -> EncryptedChatSession:
    """Create a new encrypted chat session.

    Args:
        user_id: The user's ID
        encrypted_data: The encrypted session data blob
        encryption_version: Version of the encryption format
        encrypted_name: Optional encrypted session name for display
        db_session: Database session

    Returns:
        The created EncryptedChatSession
    """
    session = EncryptedChatSession(
        id=uuid4(),
        user_id=user_id,
        encrypted_data=encrypted_data,
        encryption_version=encryption_version,
        encrypted_name=encrypted_name,
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


def update_encrypted_session(
    session_id: UUID,
    user_id: UUID,
    encrypted_data: bytes,
    db_session: Session,
    encrypted_name: bytes | None = None,
) -> EncryptedChatSession | None:
    """Update an encrypted chat session.

    Args:
        session_id: The session ID to update
        user_id: The user's ID (for authorization)
        encrypted_data: The new encrypted session data blob
        db_session: Database session
        encrypted_name: Optional new encrypted session name

    Returns:
        The updated EncryptedChatSession or None if not found
    """
    session = get_encrypted_session(session_id, user_id, db_session)
    if session is None:
        return None

    session.encrypted_data = encrypted_data
    if encrypted_name is not None:
        session.encrypted_name = encrypted_name

    db_session.commit()
    db_session.refresh(session)
    return session


def get_encrypted_session(
    session_id: UUID,
    user_id: UUID,
    db_session: Session,
) -> EncryptedChatSession | None:
    """Get an encrypted chat session by ID.

    Args:
        session_id: The session ID
        user_id: The user's ID (for authorization)
        db_session: Database session

    Returns:
        The EncryptedChatSession or None if not found
    """
    stmt = select(EncryptedChatSession).where(
        EncryptedChatSession.id == session_id,
        EncryptedChatSession.user_id == user_id,
    )
    return db_session.execute(stmt).scalar_one_or_none()


def list_encrypted_sessions(
    user_id: UUID,
    db_session: Session,
) -> list[EncryptedChatSession]:
    """List all encrypted chat sessions for a user.

    Args:
        user_id: The user's ID
        db_session: Database session

    Returns:
        List of EncryptedChatSession objects
    """
    stmt = (
        select(EncryptedChatSession)
        .where(EncryptedChatSession.user_id == user_id)
        .order_by(EncryptedChatSession.updated_at.desc())
    )
    return list(db_session.execute(stmt).scalars().all())


def delete_encrypted_session(
    session_id: UUID,
    user_id: UUID,
    db_session: Session,
) -> bool:
    """Delete an encrypted chat session.

    Args:
        session_id: The session ID to delete
        user_id: The user's ID (for authorization)
        db_session: Database session

    Returns:
        True if deleted, False if not found
    """
    session = get_encrypted_session(session_id, user_id, db_session)
    if session is None:
        return False

    db_session.delete(session)
    db_session.commit()
    return True


# ============================================================================
# Encrypted User Secret Operations
# ============================================================================


def store_encrypted_secret(
    user_id: UUID,
    secret_type: str,
    encrypted_value: bytes,
    salt: bytes,
    iv: bytes,
    encryption_version: int,
    db_session: Session,
) -> EncryptedUserSecret:
    """Store or update an encrypted user secret.

    If a secret of the same type already exists for the user, it will be updated.

    Args:
        user_id: The user's ID
        secret_type: Type of secret (e.g., 'openai_api_key')
        encrypted_value: The encrypted secret value
        salt: Salt used for key derivation
        iv: Initialization vector for encryption
        encryption_version: Version of the encryption format
        db_session: Database session

    Returns:
        The created or updated EncryptedUserSecret
    """
    # Check if secret already exists
    existing = get_encrypted_secret(user_id, secret_type, db_session)

    if existing:
        # Update existing secret
        existing.encrypted_value = encrypted_value
        existing.salt = salt
        existing.iv = iv
        existing.encryption_version = encryption_version
        db_session.commit()
        db_session.refresh(existing)
        return existing

    # Create new secret
    secret = EncryptedUserSecret(
        user_id=user_id,
        secret_type=secret_type,
        encrypted_value=encrypted_value,
        salt=salt,
        iv=iv,
        encryption_version=encryption_version,
    )
    db_session.add(secret)
    db_session.commit()
    db_session.refresh(secret)
    return secret


def get_encrypted_secret(
    user_id: UUID,
    secret_type: str,
    db_session: Session,
) -> EncryptedUserSecret | None:
    """Get an encrypted secret by type.

    Args:
        user_id: The user's ID
        secret_type: Type of secret to retrieve
        db_session: Database session

    Returns:
        The EncryptedUserSecret or None if not found
    """
    stmt = select(EncryptedUserSecret).where(
        EncryptedUserSecret.user_id == user_id,
        EncryptedUserSecret.secret_type == secret_type,
    )
    return db_session.execute(stmt).scalar_one_or_none()


def delete_encrypted_secret(
    user_id: UUID,
    secret_type: str,
    db_session: Session,
) -> bool:
    """Delete an encrypted secret.

    Args:
        user_id: The user's ID
        secret_type: Type of secret to delete
        db_session: Database session

    Returns:
        True if deleted, False if not found
    """
    secret = get_encrypted_secret(user_id, secret_type, db_session)
    if secret is None:
        return False

    db_session.delete(secret)
    db_session.commit()
    return True


def list_encrypted_secret_types(
    user_id: UUID,
    db_session: Session,
) -> list[str]:
    """List all secret types stored for a user.

    Args:
        user_id: The user's ID
        db_session: Database session

    Returns:
        List of secret type strings
    """
    stmt = select(EncryptedUserSecret.secret_type).where(
        EncryptedUserSecret.user_id == user_id
    )
    return list(db_session.execute(stmt).scalars().all())


def has_encrypted_secret(
    user_id: UUID,
    secret_type: str,
    db_session: Session,
) -> bool:
    """Check if a user has a specific encrypted secret.

    Args:
        user_id: The user's ID
        secret_type: Type of secret to check
        db_session: Database session

    Returns:
        True if the secret exists
    """
    return get_encrypted_secret(user_id, secret_type, db_session) is not None
