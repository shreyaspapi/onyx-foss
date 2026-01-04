"""add encrypted chat tables

Revision ID: e2e1a2b3c4d5
Revises: 9a0296d7421e
Create Date: 2026-01-04 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "e2e1a2b3c4d5"
down_revision = "9a0296d7421e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create encrypted_chat_session table
    op.create_table(
        "encrypted_chat_session",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Encrypted blob containing full session data
        sa.Column("encrypted_data", sa.LargeBinary(), nullable=False),
        # Unencrypted metadata for queries (no sensitive content)
        sa.Column("encryption_version", sa.Integer(), nullable=False, default=1),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        # Optional: encrypted session name (for UI listing)
        sa.Column("encrypted_name", sa.LargeBinary(), nullable=True),
    )

    # Create index for user_id for faster queries
    op.create_index(
        "ix_encrypted_chat_session_user_id",
        "encrypted_chat_session",
        ["user_id"],
    )

    # Create encrypted_user_secret table for storing encrypted API keys
    op.create_table(
        "encrypted_user_secret",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Type of secret (e.g., 'llm_api_key', 'openai_api_key')
        sa.Column("secret_type", sa.String(length=100), nullable=False),
        # Encrypted value
        sa.Column("encrypted_value", sa.LargeBinary(), nullable=False),
        # Salt for key derivation
        sa.Column("salt", sa.LargeBinary(), nullable=False),
        # IV for AES-GCM
        sa.Column("iv", sa.LargeBinary(), nullable=False),
        # Encryption version for future algorithm upgrades
        sa.Column("encryption_version", sa.Integer(), nullable=False, default=1),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        # Unique constraint on user_id + secret_type
        sa.UniqueConstraint("user_id", "secret_type", name="uq_user_secret_type"),
    )

    # Create index for user_id for faster queries
    op.create_index(
        "ix_encrypted_user_secret_user_id",
        "encrypted_user_secret",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_encrypted_user_secret_user_id", table_name="encrypted_user_secret")
    op.drop_table("encrypted_user_secret")
    op.drop_index("ix_encrypted_chat_session_user_id", table_name="encrypted_chat_session")
    op.drop_table("encrypted_chat_session")
