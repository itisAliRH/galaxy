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
            "links": [
                {"type": "github", "url": "https://github.com/alice"},
                {"url": "https://example.org"},
            ],
            "visible_sections": {"histories": True, "workflows": False},
        }
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data=payload, json=True)
        self._assert_status_code_is(response, 200)
        profile = response.json()
        assert profile["display_name"] == "Integration Alice"
        assert profile["orcid"] == VALID_ORCID
        assert profile["links"] == [
            {"type": "github", "url": "https://github.com/alice"},
            {"type": "custom", "url": "https://example.org"},
        ]
        assert profile["published"] is False
        assert profile["id"] == user_id
        assert profile["email_hash"]

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
        # the gravatar hash and encoded user id are public; account internals are not
        assert public["email_hash"]
        assert public["id"] == user_id
        assert "email" not in public
        assert "published" not in public
        assert "avatar_seed" not in public

    def test_public_profile_by_encoded_user_id(self):
        user_id = self._current_user_id()
        username = self._current_username()
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data={"published": True}, json=True)
        self._assert_status_code_is(response, 200)

        by_username = self.galaxy_interactor.get(f"profiles/{username}", anon=True)
        by_id = self.galaxy_interactor.get(f"profiles/{user_id}", anon=True)
        self._assert_status_code_is(by_username, 200)
        self._assert_status_code_is(by_id, 200)
        # the id form is the username-change-proof permalink; payloads match
        assert by_id.json() == by_username.json()
        assert by_id.json()["username"] == username

        # a well-formed encoded id that resolves to no published profile 404s
        # with the same body as an unknown username
        bogus_id = self.galaxy_interactor.get("profiles/0123456789abcdef", anon=True)
        unknown = self.galaxy_interactor.get("profiles/no-such-user-xyz", anon=True)
        self._assert_status_code_is(bogus_id, 404)
        self._assert_status_code_is(unknown, 404)
        assert bogus_id.content == unknown.content

    def _create_markdown_page(self, slug="profile-readme", title="My Readme"):
        response = self.galaxy_interactor.post(
            "pages",
            data={"title": title, "slug": slug, "content_format": "markdown", "content": "# Hello"},
            json=True,
        )
        self._assert_status_code_is(response, 200)
        return response.json()

    def test_readme_page_lifecycle(self):
        user_id = self._current_user_id()
        username = self._current_username()
        page = self._create_markdown_page()

        response = self.galaxy_interactor.put(
            f"users/{user_id}/profile", data={"published": True, "readme_page_id": page["id"]}, json=True
        )
        self._assert_status_code_is(response, 200)
        # owner sees the readme flagged as unpublished
        detail = response.json()
        assert detail["readme_page"]["id"] == page["id"]
        assert detail["readme_page"]["published"] is False
        # public payload omits it until the page is published
        public = self.galaxy_interactor.get(f"profiles/{username}", anon=True).json()
        assert public["readme_page"] is None

        response = self.galaxy_interactor.put(f"pages/{page['id']}/publish")
        self._assert_status_code_is(response, 200)
        public = self.galaxy_interactor.get(f"profiles/{username}", anon=True).json()
        assert public["readme_page"]["id"] == page["id"]
        assert public["readme_page"]["title"] == "My Readme"
        assert public["readme_page"]["content_format"] == "markdown"
        # the content itself is served by the pages API, anonymously
        page_response = self.galaxy_interactor.get(f"pages/{page['id']}", anon=True)
        self._assert_status_code_is(page_response, 200)
        assert "Hello" in page_response.json()["content"]

        response = self.galaxy_interactor.put(f"pages/{page['id']}/unpublish")
        self._assert_status_code_is(response, 200)
        public = self.galaxy_interactor.get(f"profiles/{username}", anon=True).json()
        assert public["readme_page"] is None

        # explicit null clears the readme
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data={"readme_page_id": None}, json=True)
        self._assert_status_code_is(response, 200)
        assert response.json()["readme_page"] is None

    def test_readme_page_must_be_own_markdown_page(self):
        user_id = self._current_user_id()
        response = self.galaxy_interactor.put(
            f"users/{user_id}/profile", data={"readme_page_id": "0123456789abcdef"}, json=True
        )
        self._assert_status_code_is(response, 400)

    def test_duplicate_well_known_link_rejected(self):
        user_id = self._current_user_id()
        links = [
            {"type": "github", "url": "https://github.com/alice"},
            {"type": "github", "url": "https://github.com/bob"},
        ]
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data={"links": links}, json=True)
        self._assert_status_code_is(response, 400)

    def test_starred_tools_slider_limits_public_payload_only(self):
        user_id = self._current_user_id()
        username = self._current_username()
        for tool_id in ("cat1", "Show beginning1"):
            response = self.galaxy_interactor.put(
                f"users/{user_id}/favorites/tools", data={"object_id": tool_id}, json=True
            )
            self._assert_status_code_is(response, 200)
        payload = {"published": True, "layout": {"sections": {"tools": {"limit": 1}}}}
        response = self.galaxy_interactor.put(f"users/{user_id}/profile", data=payload, json=True)
        self._assert_status_code_is(response, 200)
        # the owner still sees the full list to adjust the slider
        assert len(response.json()["starred_tools"]) == 2
        public = self.galaxy_interactor.get(f"profiles/{username}", anon=True).json()
        assert len(public["starred_tools"]) == 1

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
