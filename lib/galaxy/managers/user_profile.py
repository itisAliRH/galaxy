"""Manager for public user profile pages (the ``user_profile`` table).

Owns reading and upserting a user's profile row plus the public-by-username
lookup used by the anonymous ``/api/people/{username}`` endpoint. The public
lookup returns ``None`` for every failure mode (unknown username, inactive or
deleted user, missing or unpublished profile) so callers can produce a single,
indistinguishable 404 and not leak which usernames exist.

Config-level gating (``enable_user_profile_pages``, ``enable_beta_gdpr``)
lives in the API layer, which has access to the app configuration.
"""

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from galaxy.model import (
    User,
    UserProfile,
)
from galaxy.model.scoped_session import galaxy_scoped_session
from galaxy.schema.schema import (
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

    def to_detail(self, user: User, profile: UserProfile | None) -> UserProfileDetail:
        """Serialize the owner's view; a missing row serializes as an empty, unpublished profile."""
        if profile is None:
            return UserProfileDetail(username=user.username)
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

    def to_public(self, profile: UserProfile) -> PublicUserProfile:
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
            layout=profile.layout,
        )
