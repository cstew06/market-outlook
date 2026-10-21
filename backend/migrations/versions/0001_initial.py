"""Persistent single-user workspaces, holdings, watchlist, and cached outlooks."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("workspaces", sa.Column("name", sa.String(16), primary_key=True))
    op.create_table(
        "holdings",
        sa.Column("workspace", sa.String(16), primary_key=True),
        sa.Column("asset_id", sa.String(24), primary_key=True),
        sa.Column("quantity", sa.Numeric(28, 10), nullable=False),
        sa.Column("average_cost", sa.Numeric(28, 10), nullable=False),
        sa.CheckConstraint("quantity > 0"),
        sa.CheckConstraint("average_cost >= 0"),
    )
    op.create_table(
        "watch_items",
        sa.Column("workspace", sa.String(16), primary_key=True),
        sa.Column("asset_id", sa.String(24), primary_key=True),
    )
    op.create_table(
        "outlooks",
        sa.Column("workspace", sa.String(16), primary_key=True),
        sa.Column("asset_id", sa.String(24), primary_key=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload", sa.JSON, nullable=False),
    )


def downgrade():
    for table in ("outlooks", "watch_items", "holdings", "workspaces"):
        op.drop_table(table)
