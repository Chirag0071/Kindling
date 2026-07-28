import os

# Must be set before any `app.*` import, since app.database builds its engine
# from settings at import time.
os.environ["DATABASE_URL"] = "postgresql://dating_app:dating_app_pw@localhost:5432/dating_app_test"
os.environ["SECRET_KEY"] = "test_secret_key_for_pytest_only"

import io
import pytest
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, get_db
from app.services.rate_limiter import limiter

TEST_DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db_session():
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Each test gets a clean rate-limit slate, so tests don't fail from
    accumulated request counts left over by earlier tests."""
    try:
        limiter.reset()
    except Exception:
        pass
    yield


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_test_image_bytes(color=(225, 122, 71)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color=color).save(buf, format="JPEG")
    return buf.getvalue()


def signup_with_profile(client, email, first_name, gender, gender_preference,
                         birthdate="1998-01-01T00:00:00", lat=12.97, lng=77.59,
                         with_photo=True):
    """End-to-end helper: signup, create profile, optionally add a photo.
    Returns (token, user_id)."""
    signup = client.post("/auth/signup", json={"email": email, "password": "supersecure123"})
    assert signup.status_code == 200, signup.text
    token = signup.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/auth/me", headers=headers)
    user_id = me.json()["id"]

    profile_resp = client.post("/profile", headers=headers, json={
        "first_name": first_name,
        "birthdate": birthdate,
        "gender": gender,
        "gender_preference": gender_preference,
        "bio": "test bio",
        "prompts": [],
        "latitude": lat,
        "longitude": lng,
        "age_min": 18,
        "age_max": 99,
    })
    assert profile_resp.status_code == 200, profile_resp.text

    if with_photo:
        photo_resp = client.post(
            "/photos/upload", headers=headers,
            files={"file": ("test.jpg", make_test_image_bytes(), "image/jpeg")},
        )
        assert photo_resp.status_code == 200, photo_resp.text

    return token, user_id


def create_mutual_match(client, token_a, user_a_id, token_b, user_b_id):
    """Both users like each other, returns the match_id."""
    client.post("/matching/like", headers={"Authorization": f"Bearer {token_a}"},
                json={"to_user_id": user_b_id})
    result = client.post("/matching/like", headers={"Authorization": f"Bearer {token_b}"},
                          json={"to_user_id": user_a_id})
    assert result.json()["matched"] is True
    return result.json()["match_id"]
