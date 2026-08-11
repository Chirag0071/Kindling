from unittest.mock import patch

from app.routers.chat import _is_valid_media_url
from app.config import Settings


def _settings(**overrides):
    base = dict(
        s3_public_base_url="", s3_endpoint_url="", s3_bucket_name="dating-app-media",
        aws_region="us-east-1", cloudinary_cloud_name="",
    )
    base.update(overrides)
    return Settings(**base)


def test_local_media_path_is_valid():
    assert _is_valid_media_url("/media/photos/abc.jpg") is True


def test_cloudinary_url_for_configured_cloud_is_valid():
    s = _settings(cloudinary_cloud_name="oprnitdu")
    with patch("app.routers.chat.settings", s):
        assert _is_valid_media_url("https://res.cloudinary.com/oprnitdu/image/upload/v1/photos/x.jpg") is True


def test_cloudinary_url_for_different_cloud_is_rejected():
    # Guards against someone else's Cloudinary URL being accepted
    s = _settings(cloudinary_cloud_name="oprnitdu")
    with patch("app.routers.chat.settings", s):
        assert _is_valid_media_url("https://res.cloudinary.com/someone-elses-cloud/image/upload/v1/x.jpg") is False


def test_cloudinary_url_rejected_when_cloudinary_not_configured():
    s = _settings(cloudinary_cloud_name="")
    with patch("app.routers.chat.settings", s):
        assert _is_valid_media_url("https://res.cloudinary.com/oprnitdu/image/upload/v1/photos/x.jpg") is False


def test_s3_public_base_url_is_valid():
    s = _settings(s3_public_base_url="https://pub-xxxx.r2.dev")
    with patch("app.routers.chat.settings", s):
        assert _is_valid_media_url("https://pub-xxxx.r2.dev/photos/x.jpg") is True


def test_raw_aws_s3_url_is_valid_when_no_custom_endpoint():
    s = _settings(s3_bucket_name="dating-app-media", aws_region="us-east-1")
    with patch("app.routers.chat.settings", s):
        assert _is_valid_media_url("https://dating-app-media.s3.us-east-1.amazonaws.com/photos/x.jpg") is True


def test_arbitrary_external_url_is_rejected():
    s = _settings()
    with patch("app.routers.chat.settings", s):
        assert _is_valid_media_url("https://evil.example.com/tracker.png") is False