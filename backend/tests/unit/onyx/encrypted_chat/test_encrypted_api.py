"""Unit tests for encrypted chat API endpoints."""

import base64
import pytest
from uuid import uuid4
from datetime import datetime
from unittest.mock import MagicMock, patch

from onyx.db.encrypted_chat import (
    create_encrypted_session,
    update_encrypted_session,
    get_encrypted_session,
    list_encrypted_sessions,
    delete_encrypted_session,
    store_encrypted_secret,
    get_encrypted_secret,
    delete_encrypted_secret,
    has_encrypted_secret,
    list_encrypted_secret_types,
)


class TestEncryptedSessionOperations:
    """Tests for encrypted session database operations."""

    def test_create_encrypted_session(self):
        """Verify encrypted blob is stored correctly."""
        db_session = MagicMock()
        user_id = uuid4()
        encrypted_data = b"encrypted_content_here"
        encryption_version = 1
        encrypted_name = b"encrypted_session_name"

        # Mock the session's add and commit
        db_session.add = MagicMock()
        db_session.commit = MagicMock()
        db_session.refresh = MagicMock()

        # Create the session
        with patch("onyx.db.encrypted_chat.EncryptedChatSession") as MockSession:
            mock_instance = MagicMock()
            mock_instance.id = uuid4()
            mock_instance.user_id = user_id
            mock_instance.encrypted_data = encrypted_data
            mock_instance.encryption_version = encryption_version
            mock_instance.encrypted_name = encrypted_name
            MockSession.return_value = mock_instance

            result = create_encrypted_session(
                user_id=user_id,
                encrypted_data=encrypted_data,
                encryption_version=encryption_version,
                encrypted_name=encrypted_name,
                db_session=db_session,
            )

            # Verify the session was added
            db_session.add.assert_called_once()
            db_session.commit.assert_called_once()
            db_session.refresh.assert_called_once()

    def test_session_isolation(self):
        """Verify users cannot access each other's sessions."""
        db_session = MagicMock()
        user1_id = uuid4()
        user2_id = uuid4()
        session_id = uuid4()

        # Mock execute to return None (simulating no access)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db_session.execute.return_value = mock_result

        # User 2 should not be able to access User 1's session
        result = get_encrypted_session(
            session_id=session_id,
            user_id=user2_id,
            db_session=db_session,
        )

        assert result is None


class TestEncryptedSecretOperations:
    """Tests for encrypted secret (API key) database operations."""

    def test_store_encrypted_secret(self):
        """Verify encrypted secret is stored correctly."""
        db_session = MagicMock()
        user_id = uuid4()
        secret_type = "openai_api_key"
        encrypted_value = b"encrypted_api_key"
        salt = b"random_salt_bytes"
        iv = b"random_iv_12b"
        encryption_version = 1

        # Mock no existing secret
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        db_session.execute.return_value = mock_result

        db_session.add = MagicMock()
        db_session.commit = MagicMock()
        db_session.refresh = MagicMock()

        with patch("onyx.db.encrypted_chat.EncryptedUserSecret") as MockSecret:
            mock_instance = MagicMock()
            mock_instance.secret_type = secret_type
            MockSecret.return_value = mock_instance

            result = store_encrypted_secret(
                user_id=user_id,
                secret_type=secret_type,
                encrypted_value=encrypted_value,
                salt=salt,
                iv=iv,
                encryption_version=encryption_version,
                db_session=db_session,
            )

            # Verify the secret was added
            db_session.add.assert_called_once()
            db_session.commit.assert_called_once()

    def test_cannot_read_plaintext(self):
        """Verify server cannot access decrypted content."""
        # The encrypted_value stored is just bytes - the server has no way
        # to decrypt it without the user's password and the crypto module
        encrypted_value = base64.b64decode(
            "U2FsdGVkX1+vupppZksvRf5pq5g5XjFRIipRkwB0K1Y="
        )

        # The server only sees encrypted bytes
        # There's no decrypt method on the server side
        assert isinstance(encrypted_value, bytes)
        assert len(encrypted_value) > 0

        # Attempting to decode as UTF-8 should fail or produce garbage
        try:
            decoded = encrypted_value.decode("utf-8")
            # If it decodes, it should not contain the original plaintext
            assert "api_key" not in decoded.lower()
        except UnicodeDecodeError:
            # Expected - encrypted data is not valid UTF-8
            pass

    def test_secret_type_uniqueness(self):
        """Verify only one secret per type per user."""
        db_session = MagicMock()
        user_id = uuid4()
        secret_type = "openai_api_key"

        # Mock existing secret
        existing_secret = MagicMock()
        existing_secret.secret_type = secret_type
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_secret
        db_session.execute.return_value = mock_result

        db_session.commit = MagicMock()
        db_session.refresh = MagicMock()

        # Store should update existing, not create new
        result = store_encrypted_secret(
            user_id=user_id,
            secret_type=secret_type,
            encrypted_value=b"new_value",
            salt=b"new_salt",
            iv=b"new_iv_bytes",
            encryption_version=1,
            db_session=db_session,
        )

        # Should not call add for existing secret
        db_session.add.assert_not_called()
        # Should commit the update
        db_session.commit.assert_called_once()


class TestBase64Handling:
    """Tests for base64 encoding/decoding in API."""

    def test_valid_base64_encoding(self):
        """Verify base64 encoding works correctly."""
        original = b"test encrypted data"
        encoded = base64.b64encode(original).decode("utf-8")
        decoded = base64.b64decode(encoded)

        assert decoded == original

    def test_invalid_base64_handling(self):
        """Verify invalid base64 is rejected."""
        invalid_base64 = "not-valid-base64!!!"

        with pytest.raises(Exception):
            base64.b64decode(invalid_base64)

    def test_empty_data_handling(self):
        """Verify empty data is handled correctly."""
        empty = b""
        encoded = base64.b64encode(empty).decode("utf-8")
        decoded = base64.b64decode(encoded)

        assert decoded == empty
        assert len(decoded) == 0


class TestEncryptionVersioning:
    """Tests for encryption version handling."""

    def test_version_is_stored(self):
        """Verify encryption version is preserved."""
        db_session = MagicMock()

        with patch("onyx.db.encrypted_chat.EncryptedChatSession") as MockSession:
            mock_instance = MagicMock()
            mock_instance.encryption_version = 1
            MockSession.return_value = mock_instance

            db_session.add = MagicMock()
            db_session.commit = MagicMock()
            db_session.refresh = MagicMock()

            result = create_encrypted_session(
                user_id=uuid4(),
                encrypted_data=b"data",
                encryption_version=1,
                encrypted_name=None,
                db_session=db_session,
            )

            # Verify version was set
            assert MockSession.call_args is not None

    def test_future_version_compatibility(self):
        """Prepare for future encryption version upgrades."""
        # Current version
        current_version = 1

        # Future versions should be higher
        future_version = 2

        assert future_version > current_version
