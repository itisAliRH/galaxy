import pytest
from pydantic import ValidationError

from galaxy.managers.user_profile import UserProfileManager
from galaxy.schema.schema import (
    _validate_orcid,
    USER_PROFILE_MAX_VISIBLE_SECTIONS,
    UserProfileUpdatePayload,
)
from .base import BaseTestCase

VALID_ORCID = "0000-0002-1825-0097"


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
