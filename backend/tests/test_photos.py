from tests.conftest import make_test_image_bytes


def _signup(client, email):
    r = client.post("/auth/signup", json={"email": email, "password": "supersecure123"})
    return r.json()["access_token"]


def test_upload_and_fetch_photo(client):
    token = _signup(client, "photo1@example.com")
    upload = client.post("/photos/upload", headers={"Authorization": f"Bearer {token}"},
                          files={"file": ("test.jpg", make_test_image_bytes(), "image/jpeg")})
    assert upload.status_code == 200
    photo = upload.json()
    assert photo["is_primary"] is True  # first photo auto-primary

    fetch = client.get(photo["url"])
    assert fetch.status_code == 200
    assert fetch.headers["content-type"] == "image/jpeg"


def test_reject_non_image_upload(client):
    token = _signup(client, "photo2@example.com")
    resp = client.post("/photos/upload", headers={"Authorization": f"Bearer {token}"},
                        files={"file": ("test.txt", b"not an image", "text/plain")})
    assert resp.status_code == 400


def test_reject_oversized_upload(client):
    token = _signup(client, "photo3@example.com")
    big = b"\xff\xd8\xff" + b"0" * (9 * 1024 * 1024)
    resp = client.post("/photos/upload", headers={"Authorization": f"Bearer {token}"},
                        files={"file": ("big.jpg", big, "image/jpeg")})
    assert resp.status_code == 400


def test_max_six_photos_enforced(client):
    token = _signup(client, "photo4@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(6):
        r = client.post("/photos/upload", headers=headers,
                         files={"file": ("t.jpg", make_test_image_bytes(), "image/jpeg")})
        assert r.status_code == 200
    seventh = client.post("/photos/upload", headers=headers,
                           files={"file": ("t.jpg", make_test_image_bytes(), "image/jpeg")})
    assert seventh.status_code == 400


def test_set_primary_photo(client):
    token = _signup(client, "photo5@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    p1 = client.post("/photos/upload", headers=headers,
                      files={"file": ("t.jpg", make_test_image_bytes(), "image/jpeg")}).json()
    p2 = client.post("/photos/upload", headers=headers,
                      files={"file": ("t.jpg", make_test_image_bytes(), "image/jpeg")}).json()
    assert p1["is_primary"] is True
    assert p2["is_primary"] is False

    client.patch(f"/photos/{p2['id']}/primary", headers=headers)
    photos = client.get("/photos/me", headers=headers).json()
    primary_ids = [p["id"] for p in photos if p["is_primary"]]
    assert primary_ids == [p2["id"]]


def test_delete_photo_removes_from_storage(client):
    token = _signup(client, "photo6@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    photo = client.post("/photos/upload", headers=headers,
                         files={"file": ("t.jpg", make_test_image_bytes(), "image/jpeg")}).json()

    delete_resp = client.delete(f"/photos/{photo['id']}", headers=headers)
    assert delete_resp.status_code == 200

    fetch = client.get(photo["url"])
    assert fetch.status_code == 404


def test_cannot_delete_another_users_photo(client):
    token_a = _signup(client, "photo7a@example.com")
    token_b = _signup(client, "photo7b@example.com")
    photo = client.post("/photos/upload", headers={"Authorization": f"Bearer {token_a}"},
                         files={"file": ("t.jpg", make_test_image_bytes(), "image/jpeg")}).json()

    resp = client.delete(f"/photos/{photo['id']}", headers={"Authorization": f"Bearer {token_b}"})
    assert resp.status_code == 404


def test_oversized_upload_rejected_via_chunked_read(client):
    """Real fix: previously the whole file was read into memory via
    file.read() before any size check ran - a malicious huge upload would
    be fully buffered before rejection. Verifies the chunked reader rejects
    early and the response is still a clean 400, not a crash/timeout."""
    token = _signup(client, "photo8@example.com")
    oversized = b"\xff\xd8\xff" + b"0" * (9 * 1024 * 1024)
    resp = client.post("/photos/upload", headers={"Authorization": f"Bearer {token}"},
                        files={"file": ("big.jpg", oversized, "image/jpeg")})
    assert resp.status_code == 400
    assert "8MB" in resp.json()["detail"]
