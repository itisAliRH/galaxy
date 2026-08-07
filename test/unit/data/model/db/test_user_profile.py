import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from galaxy.model import UserProfile


def test_user_profile_roundtrip(session, make_user, make_user_profile):
    user = make_user(username="alice")
    profile = make_user_profile(
        user=user,
        published=True,
        display_name="Alice Doe",
        description="Galaxy core committer and software engineer",
        affiliation="University of Freiburg",
        orcid="0000-0003-0315-4403",
        links=[{"type": "github", "url": "https://github.com/alice"}],
        visible_sections={"histories": True, "workflows": False},
    )

    stored = session.execute(select(UserProfile).where(UserProfile.user_id == user.id)).scalar_one()
    assert stored is profile
    assert stored.published is True
    assert stored.display_name == "Alice Doe"
    assert stored.links[0]["url"] == "https://github.com/alice"
    assert stored.visible_sections["workflows"] is False
    assert user.profile is stored
    assert stored.user is user


def test_user_profile_defaults(session, make_user_profile):
    profile = make_user_profile()
    assert profile.published is False
    assert profile.display_name is None
    assert profile.links is None
    assert profile.readme_page_id is None
    assert profile.visible_sections is None


def test_user_profile_is_one_to_one(session, make_user, make_user_profile):
    user = make_user()
    make_user_profile(user=user)
    with pytest.raises(IntegrityError):
        make_user_profile(user=user)
    session.rollback()


def test_user_profile_readme_page_relationship(session, make_user, make_user_profile, make_page):
    user = make_user()
    page = make_page(user=user)
    profile = make_user_profile(user=user, readme_page_id=page.id)
    assert profile.readme_page is page

    # hard page deletion degrades the profile instead of blocking the delete
    session.delete(page)
    session.commit()
    session.refresh(profile)
    assert profile.readme_page_id is None
    assert profile.readme_page is None
