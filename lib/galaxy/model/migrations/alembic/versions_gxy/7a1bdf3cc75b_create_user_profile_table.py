"""create user_profile table

Revision ID: 7a1bdf3cc75b
Revises: e96dd6fd5863
Create Date: 2026-07-23 23:23:56.423951

"""

import sqlalchemy as sa

from galaxy.model.custom_types import MutableJSONType
from galaxy.model.migrations.util import (
    create_table,
    drop_table,
)

# revision identifiers, used by Alembic.
revision = "7a1bdf3cc75b"
down_revision = "e96dd6fd5863"
branch_labels = None
depends_on = None

table_name = "user_profile"


def upgrade():
    create_table(
        table_name,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("galaxy_user.id", ondelete="CASCADE"),
            index=True,
            unique=True,
            nullable=False,
        ),
        sa.Column("published", sa.Boolean, index=True, nullable=False, default=False),
        sa.Column("display_name", sa.Unicode(255)),
        sa.Column("description", sa.Text),
        sa.Column("affiliation", sa.Unicode(255)),
        sa.Column("research_interests", sa.Text),
        sa.Column("orcid", sa.Unicode(19)),
        sa.Column("readme_page_id", sa.Integer, sa.ForeignKey("page.id", ondelete="SET NULL"), index=True),
        sa.Column("links", MutableJSONType),
        sa.Column("visible_sections", MutableJSONType),
        sa.Column("layout", MutableJSONType),
        sa.Column("create_time", sa.DateTime),
        sa.Column("update_time", sa.DateTime),
    )


def downgrade():
    drop_table(table_name)
