def test_signup_and_login(client):
    signup = client.post("/auth/signup", json={"email": "a@example.com", "password": "supersecure123"})
    assert signup.status_code == 200
    assert "access_token" in signup.json()

    login = client.post("/auth/login", json={"email": "a@example.com", "password": "supersecure123"})
    assert login.status_code == 200
    assert "access_token" in login.json()


def test_signup_duplicate_email_rejected(client):
    client.post("/auth/signup", json={"email": "dup@example.com", "password": "supersecure123"})
    second = client.post("/auth/signup", json={"email": "dup@example.com", "password": "anotherpassword"})
    assert second.status_code == 400


def test_login_wrong_password_rejected(client):
    client.post("/auth/signup", json={"email": "b@example.com", "password": "supersecure123"})
    login = client.post("/auth/login", json={"email": "b@example.com", "password": "wrongpassword"})
    assert login.status_code == 401


def test_login_nonexistent_user_rejected(client):
    login = client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})
    assert login.status_code == 401


def test_me_requires_auth(client):
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_me_returns_current_user(client):
    signup = client.post("/auth/signup", json={"email": "c@example.com", "password": "supersecure123"})
    token = signup.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "c@example.com"


def test_signup_password_too_short_rejected(client):
    resp = client.post("/auth/signup", json={"email": "short@example.com", "password": "short"})
    assert resp.status_code == 422  # pydantic min_length validation


def test_login_rate_limit_enforced(client):
    for _ in range(10):
        client.post("/auth/login", json={"email": "x@example.com", "password": "wrong"})
    eleventh = client.post("/auth/login", json={"email": "x@example.com", "password": "wrong"})
    assert eleventh.status_code == 429
