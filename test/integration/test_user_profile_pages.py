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
