import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from galaxy.exceptions import RequestParameterInvalidException
from galaxy.managers.user_profile import UserProfileManager
from galaxy.schema.schema import (
    _validate_orcid,
    USER_PROFILE_MAX_VISIBLE_SECTIONS,
    UserProfileUpdatePayload,
)
from .base import BaseTestCase

VALID_ORCID = "0000-0002-1825-0097"

LIMITS_CONFIG = SimpleNamespace(
    user_profile_max_links=10,
    user_profile_max_section_items=20,
    user_profile_max_section_item_ids=100,
    user_profile_max_starred_tools=50,
)


class TestUserProfileManager(BaseTestCase):
    def set_up_managers(self):
        super().set_up_managers()
        self.profile_manager = UserProfileManager(self.trans.sa_session)

    def _user(self, email="profile-user@example.com", username="profile-user"):
        user = self.user_manager.create(email=email, username=username, password="password")
        return user

    def test_get_for_user_returns_none_before_first_write(self):
        user = self._user()
        assert self.profile_manager.get_for_user(user) is None
        detail = self.profile_manager.to_detail(user, None)
        assert detail.published is False
        assert detail.username == "profile-user"

    def test_avatar_seed_roundtrip(self):
        user = self._user(email="avatar-user@example.com", username="avatar-user")
        self.profile_manager.upsert(user, UserProfileUpdatePayload(avatar_seed="carbon-fox-42", published=True))
        profile = self.profile_manager.get_public_by_username("avatar-user")
        assert profile is not None
        assert self.profile_manager.to_public(profile).avatar_seed == "carbon-fox-42"

    def test_upsert_creates_then_updates(self):
        user = self._user()
        created = self.profile_manager.upsert(user, UserProfileUpdatePayload(display_name="Alice"))
        assert created.id is not None
        assert created.published is False
        assert created.display_name == "Alice"

        updated = self.profile_manager.upsert(user, UserProfileUpdatePayload(published=True, orcid=VALID_ORCID))
        assert updated.id == created.id
        # fields not present in the payload are untouched
        assert updated.display_name == "Alice"
        assert updated.published is True
        assert updated.orcid == VALID_ORCID

    def test_public_lookup_requires_published(self):
        user = self._user()
        self.profile_manager.upsert(user, UserProfileUpdatePayload(display_name="Alice"))
        assert self.profile_manager.get_public_by_username("profile-user") is None

        self.profile_manager.upsert(user, UserProfileUpdatePayload(published=True))
        profile = self.profile_manager.get_public_by_username("profile-user")
        assert profile is not None
        public = self.profile_manager.to_public(profile)
        assert public.username == "profile-user"
        assert public.display_name == "Alice"
        assert not hasattr(public, "email")
        assert not hasattr(public, "id")

    def test_public_lookup_hides_deleted_and_inactive_users(self):
        user = self._user()
        self.profile_manager.upsert(user, UserProfileUpdatePayload(published=True))
        assert self.profile_manager.get_public_by_username("profile-user") is not None

        user.deleted = True
        self.trans.sa_session.commit()
        assert self.profile_manager.get_public_by_username("profile-user") is None

        user.deleted = False
        user.active = False
        self.trans.sa_session.commit()
        assert self.profile_manager.get_public_by_username("profile-user") is None

    def test_public_lookup_unknown_username(self):
        assert self.profile_manager.get_public_by_username("no-such-user") is None
        assert self.profile_manager.get_public_by_username("") is None

    def test_starred_tools_resolution(self):
        user = self._user(email="tools-user@example.com", username="tools-user")
        user.preferences["favorites"] = json.dumps({"tools": ["cat1", "gone-tool"]})

        class _Tool:
            id = "cat1"
            name = "Concatenate datasets"

        class _Toolbox:
            def get_tool(self, tool_id):
                return _Tool() if tool_id == "cat1" else None

        starred = self.profile_manager.get_starred_tools(user, _Toolbox(), limit=50)
        assert [(tool.id, tool.name) for tool in starred] == [("cat1", "Concatenate datasets")]

    def test_public_layout_hides_hidden_sections(self):
        user = self._user(email="scrub-user@example.com", username="scrub-user")
        self.profile_manager.upsert(
            user,
            UserProfileUpdatePayload.model_validate(
                {
                    "published": True,
                    "visible_sections": {"workflows": False},
                    "layout": {
                        "section_order": ["workflows", "histories"],
                        "sections": {"workflows": {"pinned": ["abc"]}, "histories": {"limit": 3}},
                    },
                }
            ),
        )
        profile = self.profile_manager.get_public_by_username("scrub-user")
        assert profile is not None
        public = self.profile_manager.to_public(profile)
        assert public.layout is not None
        assert public.layout.section_order == ["histories"]
        assert public.layout.sections is not None
        assert "workflows" not in public.layout.sections
        assert public.layout.sections["histories"].limit == 3
        # the hidden flag itself stays visible so clients keep defaulting unknown keys to visible
        assert public.visible_sections == {"workflows": False}

    def test_layout_roundtrip(self):
        user = self._user(email="layout-user@example.com", username="layout-user")
        layout = {
            "section_order": ["histories", "workflows"],
            "sections": {"histories": {"limit": 3, "pinned": ["abc123"], "item_order": ["abc123", "def456"]}},
        }
        self.profile_manager.upsert(
            user, UserProfileUpdatePayload.model_validate({"published": True, "layout": layout})
        )
        profile = self.profile_manager.get_public_by_username("layout-user")
        assert profile is not None
        public = self.profile_manager.to_public(profile)
        assert public.layout is not None
        assert public.layout.section_order == ["histories", "workflows"]
        assert public.layout.sections is not None
        assert public.layout.sections["histories"].limit == 3
        assert public.layout.sections["histories"].pinned == ["abc123"]
        # detail view carries the same layout back to the owner
        detail = self.profile_manager.to_detail(user, self.profile_manager.get_for_user(user))
        assert detail.layout is not None
        assert detail.layout.sections is not None
        assert detail.layout.sections["histories"].item_order == ["abc123", "def456"]


class TestUserProfilePayloadValidation:
    def test_explicit_null_published_rejected(self):
        with pytest.raises(ValidationError):
            UserProfileUpdatePayload.model_validate({"published": None})

    def test_omitted_published_stays_unset(self):
        payload = UserProfileUpdatePayload.model_validate({"display_name": "X"})
        assert "published" not in payload.model_dump(exclude_unset=True)

    def test_visible_sections_bounds(self):
        too_many = {f"section-{i}": True for i in range(USER_PROFILE_MAX_VISIBLE_SECTIONS + 1)}
        with pytest.raises(ValidationError):
            UserProfileUpdatePayload.model_validate({"visible_sections": too_many})
        with pytest.raises(ValidationError):
            UserProfileUpdatePayload.model_validate({"visible_sections": {"k" * 65: True}})
        ok = UserProfileUpdatePayload.model_validate({"visible_sections": {"histories": False}})
        assert ok.visible_sections == {"histories": False}

    def test_layout_static_bounds(self):
        with pytest.raises(ValidationError):
            UserProfileUpdatePayload.model_validate({"layout": {"sections": {"histories": {"limit": 0}}}})
        with pytest.raises(ValidationError):
            UserProfileUpdatePayload.model_validate({"layout": {"section_order": ["k" * 65]}})
        ok = UserProfileUpdatePayload.model_validate(
            {"layout": {"section_order": ["histories"], "sections": {"histories": {"limit": 5}}}}
        )
        assert ok.layout is not None
        assert ok.layout.sections is not None
        assert ok.layout.sections["histories"].limit == 5


class TestConfigurableLimits:
    def _manager(self):
        return UserProfileManager(session=None)  # type: ignore[arg-type]

    def test_section_limit_capped_by_config(self):
        payload = UserProfileUpdatePayload.model_validate({"layout": {"sections": {"histories": {"limit": 21}}}})
        with pytest.raises(RequestParameterInvalidException):
            self._manager().enforce_limits(payload, LIMITS_CONFIG)
        ok = UserProfileUpdatePayload.model_validate({"layout": {"sections": {"histories": {"limit": 20}}}})
        self._manager().enforce_limits(ok, LIMITS_CONFIG)

    def test_item_ids_capped_by_config(self):
        too_many = [f"id-{i}" for i in range(101)]
        payload = UserProfileUpdatePayload.model_validate({"layout": {"sections": {"histories": {"pinned": too_many}}}})
        with pytest.raises(RequestParameterInvalidException):
            self._manager().enforce_limits(payload, LIMITS_CONFIG)

    def test_links_capped_by_config(self):
        links = [{"label": f"link {i}", "url": "https://example.org"} for i in range(11)]
        payload = UserProfileUpdatePayload.model_validate({"links": links})
        with pytest.raises(RequestParameterInvalidException):
            self._manager().enforce_limits(payload, LIMITS_CONFIG)
        self._manager().enforce_limits(UserProfileUpdatePayload.model_validate({"links": links[:10]}), LIMITS_CONFIG)


class TestOrcidValidation:
    def test_valid(self):
        assert _validate_orcid(VALID_ORCID) == VALID_ORCID
        # X checksum digit
        assert _validate_orcid("0000-0002-9079-593X") == "0000-0002-9079-593X"

    def test_empty_normalizes_to_none(self):
        assert _validate_orcid(None) is None
        assert _validate_orcid("") is None

    def test_bad_format_rejected(self):
        with pytest.raises(ValueError):
            _validate_orcid("not-an-orcid")
        with pytest.raises(ValueError):
            _validate_orcid("0000000218250097")

    def test_bad_checksum_rejected(self):
        with pytest.raises(ValueError):
            _validate_orcid("0000-0002-1825-0098")

    def test_payload_validator_wired(self):
        with pytest.raises(ValueError):
            UserProfileUpdatePayload(orcid="1234-5678-9012-3456")
        assert UserProfileUpdatePayload(orcid=VALID_ORCID).orcid == VALID_ORCID
        assert UserProfileUpdatePayload(orcid="").orcid is None
