from tests.conftest import signup_with_profile, create_mutual_match


def test_discover_requires_complete_profile(client):
    token, _ = signup_with_profile(client, "nodisc@example.com", "NoDisc", "man", ["woman"], with_photo=False)
    resp = client.get("/matching/discover", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


def test_discover_respects_gender_preference(client):
    token_a, _ = signup_with_profile(client, "seeker@example.com", "Seeker", "man", ["woman"])
    _, user_b_id = signup_with_profile(client, "wrongpref@example.com", "WrongPref", "man", ["woman"])

    results = client.get("/matching/discover", headers={"Authorization": f"Bearer {token_a}"}).json()
    ids = [r["user_id"] for r in results]
    # WrongPref is a man seeking women - Seeker is a man, so no mutual preference match
    assert user_b_id not in ids


def test_discover_shows_mutual_preference_match(client):
    token_a, _ = signup_with_profile(client, "s2@example.com", "S2", "man", ["woman"])
    _, user_b_id = signup_with_profile(client, "w2@example.com", "W2", "woman", ["man"])

    results = client.get("/matching/discover", headers={"Authorization": f"Bearer {token_a}"}).json()
    ids = [r["user_id"] for r in results]
    assert user_b_id in ids


def test_like_without_reciprocal_does_not_match(client):
    token_a, _ = signup_with_profile(client, "l1@example.com", "L1", "man", ["woman"])
    _, user_b_id = signup_with_profile(client, "l2@example.com", "L2", "woman", ["man"])

    resp = client.post("/matching/like", headers={"Authorization": f"Bearer {token_a}"},
                        json={"to_user_id": user_b_id})
    assert resp.status_code == 200
    assert resp.json()["matched"] is False


def test_mutual_like_creates_match(client):
    token_a, user_a_id = signup_with_profile(client, "m1@example.com", "M1", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "m2@example.com", "M2", "woman", ["man"])

    match_id = create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)
    assert match_id is not None

    matches = client.get("/matching/matches", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert any(m["id"] == match_id for m in matches)
    assert matches[0]["other_first_name"] == "M2"


def test_matched_users_excluded_from_future_discovery(client):
    token_a, user_a_id = signup_with_profile(client, "e1@example.com", "E1", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "e2@example.com", "E2", "woman", ["man"])
    create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)

    results = client.get("/matching/discover", headers={"Authorization": f"Bearer {token_a}"}).json()
    ids = [r["user_id"] for r in results]
    assert user_b_id not in ids


def test_cannot_like_self(client):
    token, user_id = signup_with_profile(client, "self@example.com", "Self", "man", ["woman"])
    resp = client.post("/matching/like", headers={"Authorization": f"Bearer {token}"},
                        json={"to_user_id": user_id})
    assert resp.status_code == 400


def test_duplicate_like_rejected(client):
    token_a, _ = signup_with_profile(client, "dl1@example.com", "DL1", "man", ["woman"])
    _, user_b_id = signup_with_profile(client, "dl2@example.com", "DL2", "woman", ["man"])
    client.post("/matching/like", headers={"Authorization": f"Bearer {token_a}"}, json={"to_user_id": user_b_id})
    second = client.post("/matching/like", headers={"Authorization": f"Bearer {token_a}"}, json={"to_user_id": user_b_id})
    assert second.status_code == 400


def test_matches_list_includes_message_preview_and_unread(client):
    token_a, user_a_id = signup_with_profile(client, "mp1@example.com", "MP1", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "mp2@example.com", "MP2", "woman", ["man"])
    match_id = create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)

    # No messages yet - preview should be empty, nothing unread
    matches_a = client.get("/matching/matches", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert matches_a[0]["last_message_preview"] is None
    assert matches_a[0]["has_unread"] is False

    with client.websocket_connect(f"/chat/ws/{match_id}?token={token_b}") as ws:
        ws.send_json({"content": "hey there!"})
        ws.receive_json()

    # A sent to B: A should NOT see it as unread (they sent it), B should
    matches_a = client.get("/matching/matches", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert matches_a[0]["last_message_preview"] == "hey there!"
    assert matches_a[0]["has_unread"] is True

    matches_b = client.get("/matching/matches", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert matches_b[0]["has_unread"] is False  # it's B's own sent message

    client.post(f"/chat/{match_id}/read", headers={"Authorization": f"Bearer {token_a}"})
    matches_a_after_read = client.get("/matching/matches", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert matches_a_after_read[0]["has_unread"] is False


def test_matches_list_sorted_by_recent_activity_not_just_match_date(client):
    token_a, user_a_id = signup_with_profile(client, "sa1@example.com", "SA1", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "sb1@example.com", "SB1", "woman", ["man"])
    token_c, user_c_id = signup_with_profile(client, "sc1@example.com", "SC1", "woman", ["man"])

    older_match_id = create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)
    newer_match_id = create_mutual_match(client, token_a, user_a_id, token_c, user_c_id)

    # Send a message on the OLDER match - it should now sort first, above
    # the match that was created more recently but has no activity.
    with client.websocket_connect(f"/chat/ws/{older_match_id}?token={token_a}") as ws:
        ws.send_json({"content": "bumping this one"})
        ws.receive_json()

    matches_a = client.get("/matching/matches", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert matches_a[0]["id"] == older_match_id
    assert matches_a[1]["id"] == newer_match_id


def test_discover_attributes_photos_to_correct_candidate(client):
    """Regression test for the N+1 fix: batching photo queries across
    multiple candidates must not mix up whose photos belong to whom."""
    token_a, _ = signup_with_profile(client, "pa@example.com", "PA", "man", ["woman"])
    _, user_b_id = signup_with_profile(client, "pb@example.com", "PB", "woman", ["man"])
    _, user_c_id = signup_with_profile(client, "pc@example.com", "PC", "woman", ["man"])

    results = client.get("/matching/discover", headers={"Authorization": f"Bearer {token_a}"}).json()
    by_id = {r["user_id"]: r for r in results}

    assert len(by_id[user_b_id]["photos"]) == 1
    assert len(by_id[user_c_id]["photos"]) == 1
    assert by_id[user_b_id]["photos"] != by_id[user_c_id]["photos"]


def test_malformed_user_id_returns_404_not_500(client):
    token, _ = signup_with_profile(client, "safe1@example.com", "Safe1", "man", ["woman"])
    resp = client.post("/matching/like", headers={"Authorization": f"Bearer {token}"},
                        json={"to_user_id": "not-a-real-uuid"})
    assert resp.status_code == 404
