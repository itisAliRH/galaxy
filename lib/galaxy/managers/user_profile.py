"""Manager for public user profile pages (the ``user_profile`` table).

Owns reading and upserting a user's profile row plus the public lookups (by
username or user id) used by the anonymous ``/api/profiles/{user_identifier}``
endpoint. The public lookups return ``None`` for every failure mode (unknown
user, inactive or deleted account, missing or unpublished profile) so callers
can produce a single, indistinguishable 404 and not leak which users exist.

Config-level gating (``enable_user_profile_pages``, ``enable_beta_gdpr``)
lives in the API layer, which has access to the app configuration.
"""

import logging

from sqlalchemy import (
    Select,
    select,
)
from sqlalchemy.exc import IntegrityError

from galaxy.exceptions import RequestParameterInvalidException
from galaxy.managers.favorites import FavoritesManager
from galaxy.model import (
    Page,
    User,
    UserProfile,
)
from galaxy.model.scoped_session import galaxy_scoped_session
from galaxy.schema.schema import (
    ProfileReadmePage,
    ProfileReadmePageDetail,
    ProfileStarredTool,
    PublicUserProfile,
    UserProfileDetail,
    UserProfileUpdatePayload,
)
from galaxy.util.hash_util import md5_hash_str

log = logging.getLogger(__name__)

README_PAGE_CONTENT_FORMAT = "markdown"
_INVALID_README_MESSAGE = "The readme must be one of your own pages."


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
        email_hash = md5_hash_str(user.email) if user.email else None
        if profile is None:
            return UserProfileDetail(
                id=user.id, username=user.username, email_hash=email_hash, starred_tools=starred_tools
            )
        return UserProfileDetail(
            id=user.id,
            published=profile.published,
            username=user.username,
            email_hash=email_hash,
            display_name=profile.display_name,
            description=profile.description,
            affiliation=profile.affiliation,
            research_interests=profile.research_interests,
            orcid=profile.orcid,
            readme_page=self._readme_page_detail(profile),
            links=profile.links,
            visible_sections=profile.visible_sections,
            layout=profile.layout,
            starred_tools=starred_tools,
        )

    def get_starred_tools(self, user: User, toolbox, limit: int) -> list[ProfileStarredTool]:
        """Resolve the user's favorite tools to (id, name) pairs, skipping uninstalled tools.

        Uninstalled favorites are skipped before the limit applies, so a stale
        favorite never consumes a display slot. Order follows the user's
        favorites order (``user.preferences["favorites"]``).
        """
        favorites = FavoritesManager().get(user)
        starred: list[ProfileStarredTool] = []
        for tool_id in favorites.get("tools", []):
            if len(starred) >= limit:
                break
            tool = toolbox.get_tool(tool_id)
            if tool and tool.id:
                starred.append(ProfileStarredTool(id=tool.id, name=tool.name))
        return starred

    def public_starred_tools_limit(self, profile: UserProfile, config) -> int:
        """How many starred tools the public payload may show.

        The owner's slider value (``layout.sections.tools.limit``) applies,
        capped by the instance-wide ``user_profile_max_starred_tools``.
        """
        cap = config.user_profile_max_starred_tools
        section = ((profile.layout or {}).get("sections") or {}).get("tools") or {}
        user_limit = section.get("limit")
        return min(user_limit, cap) if user_limit else cap

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
        changes = payload.model_dump(exclude_unset=True)
        if changes.get("readme_page_id") is not None:
            self._validate_readme_page(user, changes["readme_page_id"])
        profile = self.get_for_user(user)
        if profile is None:
            profile = UserProfile(user=user, published=False)
            self.session.add(profile)
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

    def _validate_readme_page(self, user: User, page_id: int) -> None:
        """Reject readme pages the user may not use.

        A single error message covers missing, deleted, and foreign pages so
        page ids are not enumerable through this endpoint.
        """
        page = self.session.get(Page, page_id)
        if page is None or page.deleted or page.user_id != user.id:
            raise RequestParameterInvalidException(_INVALID_README_MESSAGE)
        revision = page.latest_revision
        if revision is None or revision.content_format != README_PAGE_CONTENT_FORMAT:
            raise RequestParameterInvalidException("Only Markdown pages can be used as a profile readme.")

    def _public_profile_stmt(self) -> Select:
        return (
            select(UserProfile)
            .join(User, UserProfile.user_id == User.id)
            .where(
                User.active.is_(True),
                # deleted/purged are nullable booleans on old rows: exclude
                # only rows where they are actually true.
                User.deleted.isnot(True),
                User.purged.isnot(True),
                UserProfile.published.is_(True),
            )
        )

    def get_public_by_username(self, username: str) -> UserProfile | None:
        """Resolve a published profile by username for anonymous consumption.

        Returns None — never raises — when the username is unknown, the account
        is inactive, deleted, or purged, or the profile is missing or not
        published, so all failure modes are indistinguishable to the caller.
        """
        if not username:
            return None
        stmt = self._public_profile_stmt().where(User.username == username)
        return self.session.execute(stmt).scalar_one_or_none()

    def get_public_by_user_id(self, user_id: int) -> UserProfile | None:
        """Resolve a published profile by user id; same failure semantics as by-username."""
        stmt = self._public_profile_stmt().where(User.id == user_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def to_public(
        self, profile: UserProfile, starred_tools: list[ProfileStarredTool] | None = None
    ) -> PublicUserProfile:
        """Serialize the public view.

        Never include the email, raw internal ids, or unpublished state; the
        encoded user id and md5 email hash are as public as on published items.
        """
        user = profile.user
        return PublicUserProfile(
            id=user.id,
            username=user.username,
            email_hash=md5_hash_str(user.email) if user.email else None,
            display_name=profile.display_name,
            description=profile.description,
            affiliation=profile.affiliation,
            research_interests=profile.research_interests,
            orcid=profile.orcid,
            readme_page=self._public_readme_page(profile),
            links=profile.links,
            visible_sections=profile.visible_sections,
            layout=self._public_layout(profile),
            starred_tools=starred_tools,
        )

    @staticmethod
    def _readme_displayable(page: Page | None) -> bool:
        return (
            page is not None
            and not page.deleted
            and page.published
            and page.latest_revision is not None
            and page.latest_revision.content_format == README_PAGE_CONTENT_FORMAT
        )

    def _public_readme_page(self, profile: UserProfile) -> ProfileReadmePage | None:
        """The readme reference, only when publicly displayable right now.

        Page state changes independently of the profile row (unpublish,
        delete, format change), so displayability is checked at serve time.
        """
        visible = profile.visible_sections or {}
        if visible.get("readme") is False:
            return None
        page = profile.readme_page
        if not self._readme_displayable(page):
            return None
        assert page
        return ProfileReadmePage(
            id=page.id,
            title=page.title,
            content_format=page.latest_revision.content_format,
        )

    def _readme_page_detail(self, profile: UserProfile) -> ProfileReadmePageDetail | None:
        """The owner's readme reference, kept even when publicly hidden.

        The owner UI needs the blocked states (unpublished, deleted) to
        render a warning instead of silently dropping the readme.
        """
        page = profile.readme_page
        if page is None:
            return None
        revision = page.latest_revision
        return ProfileReadmePageDetail(
            id=page.id,
            title=page.title,
            content_format=revision.content_format if revision else "",
            published=bool(page.published),
            deleted=bool(page.deleted),
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
