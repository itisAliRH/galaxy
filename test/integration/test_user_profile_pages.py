"""Integration tests for user profile pages (enable_user_profile_pages)."""

from galaxy_test.driver import integration_util

VALID_ORCID = "0000-0002-1825-0097"


class TestUserProfilePagesEnabledIntegration(integration_util.IntegrationTestCase):
    require_admin_user = False

    @classmethod
    def handle_galaxy_config_kwds(cls, config):
        super().handle_galaxy_config_kwds(config)
        config["enable_user_profile_pages"] = True

    def _current_user_id(self) -> str:
        return self.galaxy_interactor.get("users/current").json()["id"]

    def test_profile_roundtrip(self):
        user_id = self._current_user_id()

        # before first write: empty, unpublished profile
        response = self.galaxy_interactor.get(f"users/{user_id}/profile")
        self._assert_status_code_is(response, 200)
        profile = response.json()
        assert profile["published"] is False
        assert profile["display_name"] is None

        # first write creates the row
        payload = {
            "display_name": "Integration Alice",
            "description": "Galaxy core committer and software engineer",
            "affiliation": "University of Freiburg",
            "orcid": VALID_ORCID,
            "avatar_seed": "carbon-fox-42",
            "links": [{"label": "website", "url": "https://example.org"}],
            "visible_sections": {"histories": True, "workflows": False},
        }
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data=payload, json=True)
        self._assert_status_code_is(response, 200)
        profile = response.json()
        assert profile["display_name"] == "Integration Alice"
        assert profile["orcid"] == VALID_ORCID
        assert profile["avatar_seed"] == "carbon-fox-42"
        assert profile["published"] is False

        # partial update: unset fields stay untouched
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data={"published": True}, json=True)
        self._assert_status_code_is(response, 200)
        profile = response.json()
        assert profile["published"] is True
        assert profile["display_name"] == "Integration Alice"

    def test_starred_tools_reported(self):
        user_id = self._current_user_id()
        response = self.galaxy_interactor.put(f"users/{user_id}/favorites/tools", data={"object_id": "cat1"}, json=True)
        self._assert_status_code_is(response, 200)

        response = self.galaxy_interactor.get(f"users/{user_id}/profile")
        self._assert_status_code_is(response, 200)
        starred = response.json()["starred_tools"]
        assert [tool["id"] for tool in starred] == ["cat1"]
        assert starred[0]["name"]

    def test_configurable_limits_enforced(self):
        user_id = self._current_user_id()
        # the default user_profile_max_links is 10
        too_many_links = [{"label": f"link {i}", "url": "https://example.org"} for i in range(11)]
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data={"links": too_many_links}, json=True)
        self._assert_status_code_is(response, 400)

        # the default user_profile_max_section_items is 20
        response = self.galaxy_interactor.put(
            f"users/{user_id}/profile",
            data={"layout": {"sections": {"histories": {"limit": 21}}}},
            json=True,
        )
        self._assert_status_code_is(response, 400)

    def test_hidden_section_layout_not_public(self):
        user_id = self._current_user_id()
        username = self._current_username()
        payload = {
            "published": True,
            "visible_sections": {"workflows": False},
            "layout": {
                "section_order": ["workflows", "histories"],
                "sections": {"workflows": {"pinned": ["abc"]}, "histories": {"limit": 3}},
            },
        }
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data=payload, json=True)
        self._assert_status_code_is(response, 200)

        response = self.galaxy_interactor.get(f"profiles/{username}", anon=True)
        self._assert_status_code_is(response, 200)
        public = response.json()
        assert public["layout"]["section_order"] == ["histories"]
        assert "workflows" not in public["layout"]["sections"]
        assert public["layout"]["sections"]["histories"]["limit"] == 3
        # the flag itself stays so clients keep defaulting unknown keys to visible
        assert public["visible_sections"]["workflows"] is False

    def test_invalid_orcid_rejected(self):
        user_id = self._current_user_id()
        response = self.galaxy_interactor.put(
            f"users/{user_id}/profile", data={"orcid": "1234-5678-9012-3456"}, json=True
        )
        self._assert_status_code_is(response, 400)

    def test_profile_requires_authentication(self):
        user_id = self._current_user_id()
        response = self.galaxy_interactor.get(f"users/{user_id}/profile", anon=True)
        self._assert_status_code_is(response, 403)

    def _current_username(self) -> str:
        return self.galaxy_interactor.get("users/current").json()["username"]

    def test_public_profile_anonymous_when_published(self):
        user_id = self._current_user_id()
        username = self._current_username()
        payload = {
            "published": True,
            "display_name": "Public Alice",
            "description": "Visible to everyone",
            "avatar_seed": "public-seed-1",
            "visible_sections": {"histories": True},
        }
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data=payload, json=True)
        self._assert_status_code_is(response, 200)

        response = self.galaxy_interactor.get(f"profiles/{username}", anon=True)
        self._assert_status_code_is(response, 200)
        public = response.json()
        assert public["username"] == username
        assert public["display_name"] == "Public Alice"
        assert public["visible_sections"] == {"histories": True}
        assert public["avatar_seed"] == "public-seed-1"
        # the public payload must never carry account internals
        assert "email" not in public
        assert "id" not in public

    def test_public_profile_404s_are_indistinguishable(self):
        user_id = self._current_user_id()
        username = self._current_username()
        # ensure the current user's profile exists but is NOT published
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data={"published": False}, json=True)
        self._assert_status_code_is(response, 200)

        unpublished = self.galaxy_interactor.get(f"profiles/{username}", anon=True)
        unknown = self.galaxy_interactor.get("profiles/no-such-user-xyz", anon=True)
        self._assert_status_code_is(unpublished, 404)
        self._assert_status_code_is(unknown, 404)
        # byte-identical bodies: no signal about whether the username exists
        assert unpublished.content == unknown.content


class TestUserProfilePagesDisabledIntegration(integration_util.IntegrationTestCase):
    require_admin_user = False

    @classmethod
    def handle_galaxy_config_kwds(cls, config):
        super().handle_galaxy_config_kwds(config)
        config["enable_user_profile_pages"] = False

    def test_public_profile_404_when_disabled(self):
        response = self.galaxy_interactor.get("profiles/any-user", anon=True)
        self._assert_status_code_is(response, 404)


class TestUserProfilePagesGdprIntegration(integration_util.IntegrationTestCase):
    require_admin_user = False

    @classmethod
    def handle_galaxy_config_kwds(cls, config):
        super().handle_galaxy_config_kwds(config)
        config["enable_user_profile_pages"] = True
        config["enable_beta_gdpr"] = True

    def test_config_reports_feature_disabled_under_gdpr(self):
        # The GDPR block forces the flag off at config level, so the client
        # never renders the profile UI in GDPR mode.
        response = self.galaxy_interactor.get("configuration", anon=True)
        self._assert_status_code_is(response, 200)
        assert response.json()["enable_user_profile_pages"] is False

    def test_public_profile_404_when_gdpr_enabled(self):
        response = self.galaxy_interactor.get("profiles/any-user", anon=True)
        self._assert_status_code_is(response, 404)

    def test_self_profile_403_when_gdpr_enabled(self):
        user_id = self.galaxy_interactor.get("users/current").json()["id"]
        response = self.galaxy_interactor.get(f"users/{user_id}/profile")
        self._assert_status_code_is(response, 403)
