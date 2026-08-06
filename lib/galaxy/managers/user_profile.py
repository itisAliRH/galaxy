"""Manager for public user profile pages (the ``user_profile`` table).

Owns reading and upserting a user's profile row plus the public-by-username
lookup used by the anonymous ``/api/profiles/{username}`` endpoint. The public
lookup returns ``None`` for every failure mode (unknown username, inactive or
deleted user, missing or unpublished profile) so callers can produce a single,
indistinguishable 404 and not leak which usernames exist.

Config-level gating (``enable_user_profile_pages``, ``enable_beta_gdpr``)
lives in the API layer, which has access to the app configuration.
"""

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from galaxy.exceptions import RequestParameterInvalidException
from galaxy.managers.favorites import FavoritesManager
from galaxy.model import (
    User,
    UserProfile,
)
from galaxy.model.scoped_session import galaxy_scoped_session
from galaxy.schema.schema import (
    ProfileStarredTool,
    PublicUserProfile,
    UserProfileDetail,
    UserProfileUpdatePayload,
)

log = logging.getLogger(__name__)


class UserProfileManager:
    """Load, update, and publicly resolve user profile rows."""

    def __init__(self, session: galaxy_scoped_session) -> None:
        self.session = session

    def get_for_user(self, user: User) -> UserProfile | None:
        """Return the user's profile row, or None if never created."""
        return self.session.execute(select(UserProfile).where(UserProfile.user_id == user.id)).scalar_one_or_none()

    def to_detail(
        self, user: User, profile: UserProfile | None, starred_tools: list[ProfileStarredTool] | None = None
    ) -> UserProfileDetail:
        """Serialize the owner's view; a missing row serializes as an empty, unpublished profile."""
        if profile is None:
            return UserProfileDetail(username=user.username, starred_tools=starred_tools)
        return UserProfileDetail(
            published=profile.published,
            username=user.username,
            display_name=profile.display_name,
            description=profile.description,
            affiliation=profile.affiliation,
            research_interests=profile.research_interests,
            orcid=profile.orcid,
            avatar_seed=profile.avatar_seed,
            links=profile.links,
            visible_sections=profile.visible_sections,
            layout=profile.layout,
            starred_tools=starred_tools,
        )

    def get_starred_tools(self, user: User, toolbox, limit: int) -> list[ProfileStarredTool]:
        """Resolve the user's favorite tools to (id, name) pairs, skipping uninstalled tools."""
        favorites = FavoritesManager().get(user)
        starred: list[ProfileStarredTool] = []
        for tool_id in favorites.get("tools", [])[:limit]:
            tool = toolbox.get_tool(tool_id)
            if tool and tool.id:
                starred.append(ProfileStarredTool(id=tool.id, name=tool.name))
        return starred

    def enforce_limits(self, payload: UserProfileUpdatePayload, config) -> None:
        """Enforce the instance-configurable size limits (user_profile_max_*).

        Static shape constraints live on the Pydantic models; anything an
        admin can tune in the configuration file is validated here instead so
        the limits stay consistent across the app.
        """
        changes = payload.model_dump(exclude_unset=True)
        links = changes.get("links")
        if links and len(links) > config.user_profile_max_links:
            raise RequestParameterInvalidException(f"A profile can hold at most {config.user_profile_max_links} links.")
        layout = changes.get("layout") or {}
        for section in (layout.get("sections") or {}).values():
            if not section:
                continue
            limit = section.get("limit")
            if limit is not None and limit > config.user_profile_max_section_items:
                raise RequestParameterInvalidException(
                    f"A section can show at most {config.user_profile_max_section_items} items."
                )
            for field in ("pinned", "item_order"):
                item_ids = section.get(field)
                if item_ids and len(item_ids) > config.user_profile_max_section_item_ids:
                    raise RequestParameterInvalidException(
                        f"A section can track at most {config.user_profile_max_section_item_ids} item ids."
                    )

    def upsert(self, user: User, payload: UserProfileUpdatePayload, commit: bool = True) -> UserProfile:
        """Apply the payload to the user's profile, creating the row on first write.

        Only fields explicitly present in the payload are modified.
        """
        profile = self.get_for_user(user)
        if profile is None:
            profile = UserProfile(user=user, published=False)
            self.session.add(profile)
        changes = payload.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(profile, field, value)
        if commit:
            try:
                self.session.commit()
            except IntegrityError:
                # Two concurrent first writes raced on the unique user_id
                # constraint; retry against the row the winner created.
                self.session.rollback()
                profile = self.get_for_user(user)
                if profile is None:
                    raise
                for field, value in changes.items():
                    setattr(profile, field, value)
                self.session.commit()
        return profile

    def get_public_by_username(self, username: str) -> UserProfile | None:
        """Resolve a published profile by username for anonymous consumption.

        Returns None — never raises — when the username is unknown, the account
        is inactive, deleted, or purged, or the profile is missing or not
        published, so all failure modes are indistinguishable to the caller.
        """
        if not username:
            return None
        stmt = (
            select(UserProfile)
            .join(User, UserProfile.user_id == User.id)
            .where(
                User.username == username,
                User.active.is_(True),
                # deleted/purged are nullable booleans on old rows: exclude
                # only rows where they are actually true.
                User.deleted.isnot(True),
                User.purged.isnot(True),
                UserProfile.published.is_(True),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def to_public(
        self, profile: UserProfile, starred_tools: list[ProfileStarredTool] | None = None
    ) -> PublicUserProfile:
        """Serialize the public view. Never include email or internal ids."""
        return PublicUserProfile(
            username=profile.user.username,
            display_name=profile.display_name,
            description=profile.description,
            affiliation=profile.affiliation,
            research_interests=profile.research_interests,
            orcid=profile.orcid,
            avatar_seed=profile.avatar_seed,
            links=profile.links,
            visible_sections=profile.visible_sections,
            layout=self._public_layout(profile),
            starred_tools=starred_tools,
        )

    @staticmethod
    def _public_layout(profile: UserProfile) -> dict | None:
        """Strip hidden sections' item ids and settings from the public payload.

        The false flags themselves stay in ``visible_sections`` so clients
        keep treating unknown keys as visible.
        """
        layout = profile.layout
        if not layout:
            return layout
        visible = profile.visible_sections or {}

        def hidden(key: str) -> bool:
            return visible.get(key) is False

        scrubbed = dict(layout)
        if layout.get("sections"):
            scrubbed["sections"] = {key: value for key, value in layout["sections"].items() if not hidden(key)}
        if layout.get("section_order"):
            scrubbed["section_order"] = [key for key in layout["section_order"] if not hidden(key)]
        return scrubbed
