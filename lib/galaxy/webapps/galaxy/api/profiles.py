"""
API operations for public user profile pages.

Serves the anonymous-readable side of user profiles under /api/profiles. The
authenticated management endpoints live under /api/users/{user_id}/profile
(see api/users.py); this namespace is keyed by username or encoded user id,
mirroring the client route /profile/{user_identifier}. The encoded-id form is
the username-change-proof permalink; clients canonicalize it back to the
username URL.
"""

import logging

from fastapi import Path

from galaxy.exceptions import (
    MessageException,
    ObjectNotFound,
)
from galaxy.managers.context import ProvidesUserContext
from galaxy.managers.user_profile import UserProfileManager
from galaxy.schema.fields import ensure_valid_id
from galaxy.schema.schema import PublicUserProfile
from galaxy.webapps.galaxy.api import (
    depends,
    DependsOnTrans,
    Router,
)

log = logging.getLogger(__name__)

router = Router(tags=["profiles"])

UserIdentifierPathParam: str = Path(
    default=...,
    title="User identifier",
    description="The public username or encoded user id of the profile owner.",
)

# One message for every failure mode (unknown user, disabled feature,
# unpublished profile, inactive account) so responses are indistinguishable
# and users cannot be enumerated through this endpoint.
PROFILE_NOT_FOUND_MESSAGE = "No public profile is available for this user."


@router.cbv
class FastAPIProfiles:
    profile_manager: UserProfileManager = depends(UserProfileManager)

    @router.get(
        "/api/profiles/{user_identifier}",
        name="get_public_user_profile",
        summary="Return the public profile page for a username or encoded user id",
        public=True,
    )
    def show(
        self,
        trans: ProvidesUserContext = DependsOnTrans,
        user_identifier: str = UserIdentifierPathParam,
    ) -> PublicUserProfile:
        config = trans.app.config
        if not config.enable_user_profile_pages or config.enable_beta_gdpr:
            raise ObjectNotFound(PROFILE_NOT_FOUND_MESSAGE)
        profile = self._resolve_public_profile(trans, user_identifier)
        if profile is None:
            raise ObjectNotFound(PROFILE_NOT_FOUND_MESSAGE)
        # Starred tools are derived data; keep them out of the payload when
        # the owner has hidden the tools section.
        starred_tools = None
        if (profile.visible_sections or {}).get("tools", True):
            starred_tools = self.profile_manager.get_starred_tools(
                profile.user,
                trans.app.toolbox,
                self.profile_manager.public_starred_tools_limit(profile, config),
            )
        return self.profile_manager.to_public(profile, starred_tools=starred_tools)

    def _resolve_public_profile(self, trans: ProvidesUserContext, user_identifier: str):
        """Resolve the identifier username-first, then as an encoded user id.

        Usernames win: a (theoretical) username shaped exactly like an encoded
        id shadows the id form, keeping every existing username URL stable.
        The id decode stays in the API layer, which has access to
        ``trans.security``; the manager remains framework-free.
        """
        profile = self.profile_manager.get_public_by_username(user_identifier)
        if profile is not None:
            return profile
        try:
            ensure_valid_id(user_identifier)
            user_id = trans.security.decode_id(user_identifier)
        except (ValueError, MessageException):
            return None
        return self.profile_manager.get_public_by_user_id(user_id)
