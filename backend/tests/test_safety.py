from tests.conftest import signup_with_profile, create_mutual_match


def test_block_deactivates_existing_match(client):
    token_a, user_a_id = signup_with_profile(client, "ba@example.com", "BA", "man", ["woman"])
    token_b, user_b_id = signup_with_profile(client, "bb@example.com", "BB", "woman", ["man"])
    match_id = create_mutual_match(client, token_a, user_a_id, token_b, user_b_id)

    block_resp = client.post("/safety/block", headers={"Authorization": f"Bearer {token_a}"},
                              json={"user_id": user_b_id})
    assert block_resp.status_code == 200

    matches_a = client.get("/matching/matches", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert not any(m["id"] == match_id for m in matches_a)


def test_duplicate_block_rejected(client):
    token_a, _ = signup_with_profile(client, "db1@example.com", "DB1", "man", ["woman"])
    _, user_b_id = signup_with_profile(client, "db2@example.com", "DB2", "woman", ["man"])
    client.post("/safety/block", headers={"Authorization": f"Bearer {token_a}"}, json={"user_id": user_b_id})
    second = client.post("/safety/block", headers={"Authorization": f"Bearer {token_a}"}, json={"user_id": user_b_id})
    assert second.status_code == 400


def test_cannot_block_self(client):
    token, user_id = signup_with_profile(client, "selfblock@example.com", "SelfBlock", "man", ["woman"])
    resp = client.post("/safety/block", headers={"Authorization": f"Bearer {token}"}, json={"user_id": user_id})
    assert resp.status_code == 400


def test_report_with_auto_block(client):
    token_a, _ = signup_with_profile(client, "ra@example.com", "RA", "man", ["woman"])
    _, user_b_id = signup_with_profile(client, "rb@example.com", "RB", "woman", ["man"])

    resp = client.post("/safety/report", headers={"Authorization": f"Bearer {token_a}"},
                        json={"user_id": user_b_id, "reason": "harassment", "block_too": True})
    assert resp.status_code == 200
    assert resp.json()["status"] == "open"

    blocks = client.get("/safety/blocks", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert any(b["blocked_id"] == user_b_id for b in blocks)


def test_unblock(client):
    token_a, _ = signup_with_profile(client, "ub1@example.com", "UB1", "man", ["woman"])
    _, user_b_id = signup_with_profile(client, "ub2@example.com", "UB2", "woman", ["man"])
    client.post("/safety/block", headers={"Authorization": f"Bearer {token_a}"}, json={"user_id": user_b_id})

    resp = client.delete(f"/safety/block/{user_b_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert resp.status_code == 200

    blocks = client.get("/safety/blocks", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert not any(b["blocked_id"] == user_b_id for b in blocks)


def test_malformed_id_returns_404_not_500_on_block(client):
    token, _ = signup_with_profile(client, "safeblock@example.com", "SafeBlock", "man", ["woman"])
    resp = client.post("/safety/block", headers={"Authorization": f"Bearer {token}"}, json={"user_id": "garbage"})
    assert resp.status_code == 404


def test_malformed_id_returns_404_not_500_on_report(client):
    token, _ = signup_with_profile(client, "safereport@example.com", "SafeReport", "man", ["woman"])
    resp = client.post("/safety/report", headers={"Authorization": f"Bearer {token}"},
                        json={"user_id": "garbage", "reason": "test"})
    assert resp.status_code == 404
