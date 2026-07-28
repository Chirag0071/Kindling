def _signup(client, email="p@example.com"):
    r = client.post("/auth/signup", json={"email": email, "password": "supersecure123"})
    return r.json()["access_token"]


def test_create_profile(client):
    token = _signup(client)
    resp = client.post("/profile", headers={"Authorization": f"Bearer {token}"}, json={
        "first_name": "Sam", "birthdate": "1998-01-01T00:00:00", "gender": "man",
        "gender_preference": ["woman"], "bio": "hi", "prompts": [],
        "latitude": 12.9, "longitude": 77.6, "age_min": 18, "age_max": 99,
    })
    assert resp.status_code == 200
    assert resp.json()["first_name"] == "Sam"


def test_underage_profile_rejected(client):
    token = _signup(client, "minor@example.com")
    resp = client.post("/profile", headers={"Authorization": f"Bearer {token}"}, json={
        "first_name": "Minor", "birthdate": "2015-01-01T00:00:00", "gender": "man",
        "gender_preference": ["woman"], "bio": "hi", "prompts": [],
        "latitude": 12.9, "longitude": 77.6, "age_min": 18, "age_max": 99,
    })
    assert resp.status_code == 400
    assert "18" in resp.json()["detail"]


def test_profile_incomplete_without_photo(client):
    token = _signup(client, "nophoto@example.com")
    client.post("/profile", headers={"Authorization": f"Bearer {token}"}, json={
        "first_name": "NoPhoto", "birthdate": "1998-01-01T00:00:00", "gender": "man",
        "gender_preference": ["woman"], "bio": "hi", "prompts": [],
        "latitude": 12.9, "longitude": 77.6, "age_min": 18, "age_max": 99,
    })
    profile = client.get("/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert profile.json()["is_complete"] is False


def test_profile_me_requires_existing_profile(client):
    token = _signup(client, "noprofile@example.com")
    resp = client.get("/profile/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404
