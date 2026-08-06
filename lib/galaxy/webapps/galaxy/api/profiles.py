"""
API operations for public user profile pages.

Serves the anonymous-readable side of user profiles under /api/profiles. The
authenticated management endpoints live under /api/users/{user_id}/profile
(see api/users.py); this namespace is keyed by username instead of an encoded
user id, mirroring the client route /profile/{username}.
"""

import logging

from fastapi import Path

from galaxy.exceptions import ObjectNotFound
from galaxy.managers.context import ProvidesUserContext
from galaxy.managers.user_profile import UserProfileManager
from galaxy.schema.schema import PublicUserProfile
from galaxy.webapps.galaxy.api import (
    depends,
    DependsOnTrans,
    Router,
)

log = logging.getLogger(__name__)

router = Router(tags=["profiles"])

UsernamePathParam: str = Path(
    default=...,
    title="Username",
    description="The public username of the profile owner.",
)

# One message for every failure mode (unknown username, disabled feature,
# unpublished profile, inactive account) so responses are indistinguishable
# and usernames cannot be enumerated through this endpoint.
PROFILE_NOT_FOUND_MESSAGE = "No public profile is available for this username."


@router.cbv
class FastAPIProfiles:
    profile_manager: UserProfileManager = depends(UserProfileManager)

    @router.get(
        "/api/profiles/{username}",
        name="get_public_user_profile",
        summary="Return the public profile page for a username",
        public=True,
    )
    def show(
        self,
        trans: ProvidesUserContext = DependsOnTrans,
        username: str = UsernamePathParam,
    ) -> PublicUserProfile:
        config = trans.app.config
        if not config.enable_user_profile_pages or config.enable_beta_gdpr:
            raise ObjectNotFound(PROFILE_NOT_FOUND_MESSAGE)
        profile = self.profile_manager.get_public_by_username(username)
        if profile is None:
            raise ObjectNotFound(PROFILE_NOT_FOUND_MESSAGE)
        # Starred tools are derived data; keep them out of the payload when
        # the owner has hidden the tools section.
        starred_tools = None
        if (profile.visible_sections or {}).get("tools", True):
            starred_tools = self.profile_manager.get_starred_tools(
                profile.user, trans.app.toolbox, config.user_profile_max_starred_tools
            )
        return self.profile_manager.to_public(profile, starred_tools=starred_tools)
