import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from galaxy.exceptions import RequestParameterInvalidException
from galaxy.managers.user_profile import UserProfileManager
from galaxy.model import (
    Page,
    PageRevision,
)
from galaxy.schema.fields import Security
from galaxy.schema.schema import (
    _validate_orcid,
    USER_PROFILE_MAX_VISIBLE_SECTIONS,
    UserProfileUpdatePayload,
)
from galaxy.util.hash_util import md5_hash_str
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
        # EncodedDatabaseIdField encodes through the module-level
        # Security.security; point it at the same helper trans uses.
        Security.security = self.trans.security

    def _user(self, email="profile-user@example.com", username="profile-user"):
        user = self.user_manager.create(email=email, username=username, password="password")
        return user

    def _page(self, user, title="My Readme", slug="my-readme", content_format="markdown", deleted=False):
        session = self.trans.sa_session
        page = Page(user=user, title=title, slug=slug, deleted=deleted)
        session.add(page)
        revision = PageRevision()
        revision.page = page
        revision.title = title
        revision.content = "# hello"
        revision.content_format = content_format
        session.add(revision)
        page.latest_revision = revision
        session.commit()
        return page

    def test_get_for_user_returns_none_before_first_write(self):
        user = self._user()
        assert self.profile_manager.get_for_user(user) is None
        detail = self.profile_manager.to_detail(user, None)
        assert detail.published is False
        assert detail.username == "profile-user"

    def test_email_hash_and_encoded_id_in_serializers(self):
        user = self._user(email="avatar-user@example.com", username="avatar-user")
        self.profile_manager.upsert(user, UserProfileUpdatePayload(published=True))
        profile = self.profile_manager.get_public_by_username("avatar-user")
        assert profile is not None
        public = self.profile_manager.to_public(profile)
        assert public.email_hash == md5_hash_str("avatar-user@example.com")
        assert public.id == self.trans.security.encode_id(user.id)
        detail = self.profile_manager.to_detail(user, profile)
        assert detail.email_hash == public.email_hash
        assert detail.id == public.id
        # a missing profile row still serializes the identity fields
        fresh = self._user(email="fresh@example.com", username="fresh-user")
        empty_detail = self.profile_manager.to_detail(fresh, None)
        assert empty_detail.email_hash == md5_hash_str("fresh@example.com")
        assert empty_detail.id == self.trans.security.encode_id(fresh.id)

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
        assert not hasattr(public, "published")
        # the encoded user id is the username-change-proof permalink key
        assert public.id == self.trans.security.encode_id(user.id)

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

    def test_public_lookup_by_user_id(self):
        user = self._user(email="by-id@example.com", username="by-id-user")
        # mirrors every by-username failure mode
        assert self.profile_manager.get_public_by_user_id(user.id) is None  # no profile row
        self.profile_manager.upsert(user, UserProfileUpdatePayload(display_name="Alice"))
        assert self.profile_manager.get_public_by_user_id(user.id) is None  # unpublished
        self.profile_manager.upsert(user, UserProfileUpdatePayload(published=True))
        profile = self.profile_manager.get_public_by_user_id(user.id)
        assert profile is not None
        assert profile is self.profile_manager.get_public_by_username("by-id-user")
        user.deleted = True
        self.trans.sa_session.commit()
        assert self.profile_manager.get_public_by_user_id(user.id) is None
        user.deleted = False
        user.active = False
        self.trans.sa_session.commit()
        assert self.profile_manager.get_public_by_user_id(user.id) is None
        assert self.profile_manager.get_public_by_user_id(99999999) is None

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

    def test_starred_tools_uninstalled_do_not_consume_limit_slots(self):
        user = self._user(email="slots-user@example.com", username="slots-user")
        # an uninstalled favorite listed first must not eat the display slot
        user.preferences["favorites"] = json.dumps({"tools": ["gone-tool", "cat1", "cat2"]})

        class _Toolbox:
            def get_tool(self, tool_id):
                if tool_id == "gone-tool":
                    return None
                return SimpleNamespace(id=tool_id, name=f"Tool {tool_id}")

        starred = self.profile_manager.get_starred_tools(user, _Toolbox(), limit=2)
        assert [tool.id for tool in starred] == ["cat1", "cat2"]

    def _readme_payload(self, page_id, **extra):
        encoded = self.trans.security.encode_id(page_id) if page_id is not None else None
        return UserProfileUpdatePayload.model_validate({"readme_page_id": encoded, **extra})

    def test_readme_page_upsert_and_serialization(self):
        user = self._user(email="readme@example.com", username="readme-user")
        page = self._page(user)
        self.profile_manager.upsert(user, self._readme_payload(page.id, published=True))

        # unpublished page: owner sees it flagged, public payload omits it
        detail = self.profile_manager.to_detail(user, self.profile_manager.get_for_user(user))
        assert detail.readme_page is not None
        assert detail.readme_page.published is False
        profile = self.profile_manager.get_public_by_username("readme-user")
        assert profile is not None
        assert self.profile_manager.to_public(profile).readme_page is None

        page.published = True
        self.trans.sa_session.commit()
        public = self.profile_manager.to_public(profile)
        assert public.readme_page is not None
        assert public.readme_page.id == self.trans.security.encode_id(page.id)
        assert public.readme_page.title == "My Readme"
        assert public.readme_page.content_format == "markdown"

        # hidden readme section wins over a displayable page
        self.profile_manager.upsert(
            user, UserProfileUpdatePayload.model_validate({"visible_sections": {"readme": False}})
        )
        assert self.profile_manager.to_public(profile).readme_page is None
        self.profile_manager.upsert(
            user, UserProfileUpdatePayload.model_validate({"visible_sections": {"readme": True}})
        )

        # page soft-deleted after selection: hidden publicly, flagged for the owner
        page.deleted = True
        self.trans.sa_session.commit()
        assert self.profile_manager.to_public(profile).readme_page is None
        detail = self.profile_manager.to_detail(user, self.profile_manager.get_for_user(user))
        assert detail.readme_page is not None
        assert detail.readme_page.deleted is True

    def test_readme_page_upsert_rejections(self):
        user = self._user(email="readme-owner@example.com", username="readme-owner")
        other = self._user(email="readme-other@example.com", username="readme-other")

        foreign_page = self._page(other, slug="foreign")
        with pytest.raises(RequestParameterInvalidException):
            self.profile_manager.upsert(user, self._readme_payload(foreign_page.id))

        deleted_page = self._page(user, slug="deleted", deleted=True)
        with pytest.raises(RequestParameterInvalidException):
            self.profile_manager.upsert(user, self._readme_payload(deleted_page.id))

        html_page = self._page(user, slug="html", content_format="html")
        with pytest.raises(RequestParameterInvalidException):
            self.profile_manager.upsert(user, self._readme_payload(html_page.id))

        with pytest.raises(RequestParameterInvalidException):
            self.profile_manager.upsert(user, self._readme_payload(99999999))

        # a valid own markdown page is accepted and an explicit null clears it
        page = self._page(user, slug="good")
        profile = self.profile_manager.upsert(user, self._readme_payload(page.id))
        assert profile.readme_page_id == page.id
        profile = self.profile_manager.upsert(user, self._readme_payload(None))
        assert profile.readme_page_id is None

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
        links = [{"url": f"https://example.org/{i}"} for i in range(11)]
        payload = UserProfileUpdatePayload.model_validate({"links": links})
        with pytest.raises(RequestParameterInvalidException):
            self._manager().enforce_limits(payload, LIMITS_CONFIG)
        self._manager().enforce_limits(UserProfileUpdatePayload.model_validate({"links": links[:10]}), LIMITS_CONFIG)

    def test_public_starred_tools_limit(self):
        manager = self._manager()

        def profile_with_limit(limit):
            layout = {"sections": {"tools": {"limit": limit}}} if limit is not None else None
            return SimpleNamespace(layout=layout)

        # no layout → instance cap
        assert manager.public_starred_tools_limit(profile_with_limit(None), LIMITS_CONFIG) == 50
        # slider below the cap wins
        assert manager.public_starred_tools_limit(profile_with_limit(3), LIMITS_CONFIG) == 3
        # slider can never exceed the instance cap
        assert manager.public_starred_tools_limit(profile_with_limit(500), LIMITS_CONFIG) == 50


class TestProfileLinksValidation:
    def test_type_defaults_to_custom(self):
        payload = UserProfileUpdatePayload.model_validate({"links": [{"url": "https://example.org"}]})
        assert payload.links is not None
        # use_enum_values on the base Model stores the raw string
        assert payload.links[0].type == "custom"

    def test_typed_links_roundtrip(self):
        links = [
            {"type": "gtn", "url": "https://training.galaxyproject.org/hall-of-fame/alice/"},
            {"type": "hub", "url": "https://galaxyproject.org/people/alice/"},
            {"type": "github", "url": "https://github.com/alice"},
            {"type": "custom", "url": "https://alice.example.org"},
        ]
        payload = UserProfileUpdatePayload.model_validate({"links": links})
        assert payload.links is not None
        assert [link.type for link in payload.links] == ["gtn", "hub", "github", "custom"]

    def test_duplicate_well_known_slot_rejected(self):
        links = [
            {"type": "github", "url": "https://github.com/alice"},
            {"type": "github", "url": "https://github.com/bob"},
        ]
        with pytest.raises(ValidationError):
            UserProfileUpdatePayload.model_validate({"links": links})

    def test_multiple_custom_links_allowed(self):
        links = [{"type": "custom", "url": f"https://example.org/{i}"} for i in range(3)]
        payload = UserProfileUpdatePayload.model_validate({"links": links})
        assert payload.links is not None
        assert len(payload.links) == 3

    def test_well_known_slot_requires_https(self):
        with pytest.raises(ValidationError):
            UserProfileUpdatePayload.model_validate({"links": [{"type": "github", "url": "http://github.com/alice"}]})
        # custom links may stay on plain http
        payload = UserProfileUpdatePayload.model_validate({"links": [{"url": "http://legacy.example.org"}]})
        assert payload.links is not None

    def test_label_field_is_gone(self):
        payload = UserProfileUpdatePayload.model_validate({"links": [{"url": "https://example.org"}]})
        assert payload.links is not None
        assert "label" not in payload.links[0].model_dump()


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
