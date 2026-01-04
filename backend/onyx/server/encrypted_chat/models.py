"""Pydantic models for encrypted chat API."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# ============================================================================
# Encrypted Session Models
# ============================================================================


class CreateEncryptedSessionRequest(BaseModel):
    """Request to create a new encrypted chat session."""

    # Base64 encoded encrypted data blob
    encrypted_data: str
    # Encryption format version
    encryption_version: int
    # Optional base64 encoded encrypted session name
    encrypted_name: str | None = None


class UpdateEncryptedSessionRequest(BaseModel):
    """Request to update an encrypted chat session."""

    # Base64 encoded encrypted data blob
    encrypted_data: str
    # Optional base64 encoded encrypted session name
    encrypted_name: str | None = None


class EncryptedSessionResponse(BaseModel):
    """Response containing an encrypted session."""

    session_id: UUID
    encrypted_data: str  # Base64 encoded
    encryption_version: int
    created_at: datetime
    updated_at: datetime
    encrypted_name: str | None = None  # Base64 encoded


class EncryptedSessionListItem(BaseModel):
    """List item for encrypted sessions (minimal data for sidebar)."""

    session_id: UUID
    encrypted_name: str | None = None  # Base64 encoded
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Encrypted Secret Models
# ============================================================================


class StoreSecretRequest(BaseModel):
    """Request to store an encrypted secret."""

    # Type of secret being stored
    secret_type: str
    # Base64 encoded encrypted value
    encrypted_value: str
    # Base64 encoded salt for key derivation
    salt: str
    # Base64 encoded IV
    iv: str
    # Encryption version
    version: int


class EncryptedSecretResponse(BaseModel):
    """Response when retrieving an encrypted secret."""

    secret_type: str
    encrypted_value: str  # Base64 encoded
    salt: str  # Base64 encoded
    iv: str  # Base64 encoded
    version: int


class SecretStoredResponse(BaseModel):
    """Response when a secret is stored successfully."""

    success: bool
    secret_type: str
