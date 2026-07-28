from tests.conftest import signup_with_profile, create_mutual_match, make_test_image_bytes


def test_story_visible_to_matched_user_only(client):
    token_a, user_a_id = signup_with_profile(client, "sa@example.com", "SA", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "sb@example.com", "SB", "woman", ["man"])
    create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)

    client.post("/stories/upload", headers={"Authorization": f"Bearer {token_a}"},
                files={"file": ("s.jpg", make_test_image_bytes(), "image/jpeg")},
                data={"caption": "hello"})

    feed_b = client.get("/stories/feed", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert len(feed_b) == 1
    assert feed_b[0]["first_name"] == "SA"
    assert feed_b[0]["stories"][0]["caption"] == "hello"


def test_story_not_visible_to_unmatched_user(client):
    token_a, _ = signup_with_profile(client, "sc@example.com", "SC", "man", ["woman"])
    stranger_token, _ = signup_with_profile(client, "sd@example.com", "SD", "woman", ["man"])

    client.post("/stories/upload", headers={"Authorization": f"Bearer {token_a}"},
                files={"file": ("s.jpg", make_test_image_bytes(), "image/jpeg")})

    feed = client.get("/stories/feed", headers={"Authorization": f"Bearer {stranger_token}"}).json()
    assert feed == []


def test_blocked_user_story_hidden_even_if_matched(client):
    token_a, user_a_id = signup_with_profile(client, "se@example.com", "SE", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "sf@example.com", "SF", "woman", ["man"])
    create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)
    client.post("/stories/upload", headers={"Authorization": f"Bearer {token_a}"},
                files={"file": ("s.jpg", make_test_image_bytes(), "image/jpeg")})

    client.post("/safety/block", headers={"Authorization": f"Bearer {token_b}"}, json={"user_id": user_a_id})

    feed_b = client.get("/stories/feed", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert feed_b == []


def test_delete_own_story(client):
    token, _ = signup_with_profile(client, "sg@example.com", "SG", "man", ["woman"])
    story = client.post("/stories/upload", headers={"Authorization": f"Bearer {token}"},
                         files={"file": ("s.jpg", make_test_image_bytes(), "image/jpeg")}).json()

    resp = client.delete(f"/stories/{story['id']}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200

    mine = client.get("/stories/me", headers={"Authorization": f"Bearer {token}"}).json()
    assert mine == []

    fetch = client.get(story["media_url"])
    assert fetch.status_code == 404


def test_expired_story_excluded_from_feed(client, db_session):
    from datetime import datetime, timedelta
    from app import models

    token_a, user_a_id = signup_with_profile(client, "sh@example.com", "SH", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "si@example.com", "SI", "woman", ["man"])
    create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)

    story = client.post("/stories/upload", headers={"Authorization": f"Bearer {token_a}"},
                         files={"file": ("s.jpg", make_test_image_bytes(), "image/jpeg")}).json()

    # Confirm visible before expiry
    assert len(client.get("/stories/feed", headers={"Authorization": f"Bearer {token_b}"}).json()) == 1

    # Backdate expiry using the same db_session the test client is wired to
    db_story = db_session.query(models.Story).filter(models.Story.id == story["id"]).first()
    db_story.expires_at = datetime.utcnow() - timedelta(hours=1)
    db_session.commit()

    feed_after = client.get("/stories/feed", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert feed_after == []
