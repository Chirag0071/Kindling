from unittest.mock import patch, MagicMock

import pytest

from app.config import Settings
from app.services import storage as storage_module

# cloudinary.uploader runs setup code (which calls cloudinary.config()) the
# first time it's imported. Importing it here, before any test patches
# cloudinary.config, ensures that setup runs against real config instead of
# a MagicMock.
import cloudinary.uploader  # noqa: E402


def _settings(**overrides):
    base = dict(
        aws_access_key_id="", aws_secret_access_key="", aws_region="us-east-1",
        s3_bucket_name="dating-app-media", s3_endpoint_url="", s3_public_base_url="",
        cloudinary_cloud_name="", cloudinary_api_key="", cloudinary_api_secret="",
    )
    base.update(overrides)
    return Settings(**base)


def test_get_storage_backend_defaults_to_local_without_credentials():
    with patch.object(storage_module, "settings", _settings()):
        backend = storage_module.get_storage_backend()
        assert isinstance(backend, storage_module.LocalStorageBackend)


def test_get_storage_backend_picks_s3_when_credentials_present():
    s = _settings(aws_access_key_id="AKIA123", aws_secret_access_key="secret")
    with patch.object(storage_module, "settings", s), \
         patch("boto3.client") as mock_boto:
        backend = storage_module.get_storage_backend()
        assert isinstance(backend, storage_module.S3StorageBackend)
        mock_boto.assert_called_once()


def test_s3_backend_aws_style_url_and_acl():
    s = _settings(aws_access_key_id="AKIA123", aws_secret_access_key="secret")
    with patch.object(storage_module, "settings", s), \
         patch("boto3.client") as mock_boto:
        mock_client = MagicMock()
        mock_boto.return_value = mock_client

        backend = storage_module.S3StorageBackend()
        url = backend.upload(b"fakejpegdata", "photo.jpg", "image/jpeg", folder="photos")

        assert url.startswith("https://dating-app-media.s3.us-east-1.amazonaws.com/photos/")
        call_kwargs = mock_client.put_object.call_args.kwargs
        assert call_kwargs["ACL"] == "public-read"


def test_s3_backend_custom_endpoint_no_acl_and_custom_url():
    s = _settings(
        aws_access_key_id="key", aws_secret_access_key="secret",
        s3_endpoint_url="https://abc123.r2.cloudflarestorage.com",
        s3_public_base_url="https://pub-xyz.r2.dev",
    )
    with patch.object(storage_module, "settings", s), \
         patch("boto3.client") as mock_boto:
        mock_client = MagicMock()
        mock_boto.return_value = mock_client

        backend = storage_module.S3StorageBackend()
        url = backend.upload(b"fakejpegdata", "photo.jpg", "image/jpeg", folder="photos")

        assert url.startswith("https://pub-xyz.r2.dev/photos/")
        call_kwargs = mock_client.put_object.call_args.kwargs
        assert "ACL" not in call_kwargs  # R2 doesn't support object ACLs the AWS way

        # boto3.client should have been given the custom endpoint
        boto_call_kwargs = mock_boto.call_args.kwargs
        assert boto_call_kwargs["endpoint_url"] == "https://abc123.r2.cloudflarestorage.com"


def test_s3_backend_requires_public_base_url_for_custom_endpoint():
    s = _settings(
        aws_access_key_id="key", aws_secret_access_key="secret",
        s3_endpoint_url="https://abc123.r2.cloudflarestorage.com",
        s3_public_base_url="",  # missing on purpose
    )
    with patch.object(storage_module, "settings", s), patch("boto3.client"):
        with pytest.raises(ValueError):
            storage_module.S3StorageBackend()


def test_s3_backend_delete_strips_public_base_url_regardless_of_shape():
    s = _settings(
        aws_access_key_id="key", aws_secret_access_key="secret",
        s3_endpoint_url="https://abc123.r2.cloudflarestorage.com",
        s3_public_base_url="https://pub-xyz.r2.dev",
    )
    with patch.object(storage_module, "settings", s), \
         patch("boto3.client") as mock_boto:
        mock_client = MagicMock()
        mock_boto.return_value = mock_client

        backend = storage_module.S3StorageBackend()
        backend.delete("https://pub-xyz.r2.dev/photos/abc-123.jpg")

        mock_client.delete_object.assert_called_once_with(
            Bucket="dating-app-media", Key="photos/abc-123.jpg"
        )


def test_get_storage_backend_picks_cloudinary_when_credentials_present():
    s = _settings(cloudinary_cloud_name="demo", cloudinary_api_key="key", cloudinary_api_secret="secret")
    with patch.object(storage_module, "settings", s), patch("cloudinary.config") as mock_config:
        backend = storage_module.get_storage_backend()
        assert isinstance(backend, storage_module.CloudinaryStorageBackend)
        mock_config.assert_called_once()


def test_get_storage_backend_prefers_cloudinary_over_s3_when_both_present():
    s = _settings(
        cloudinary_cloud_name="demo", cloudinary_api_key="key", cloudinary_api_secret="secret",
        aws_access_key_id="AKIA123", aws_secret_access_key="secret",
    )
    with patch.object(storage_module, "settings", s), patch("cloudinary.config"):
        backend = storage_module.get_storage_backend()
        assert isinstance(backend, storage_module.CloudinaryStorageBackend)


def test_cloudinary_backend_upload_returns_secure_url_and_picks_resource_type():
    s = _settings(cloudinary_cloud_name="demo", cloudinary_api_key="key", cloudinary_api_secret="secret")
    with patch.object(storage_module, "settings", s), \
         patch("cloudinary.config"), \
         patch("cloudinary.uploader.upload") as mock_upload:
        mock_upload.return_value = {"secure_url": "https://res.cloudinary.com/demo/video/upload/v123/uploads/abc.mp4"}

        backend = storage_module.CloudinaryStorageBackend()
        url = backend.upload(b"fakevideodata", "clip.mp4", "video/mp4", folder="uploads")

        assert url == "https://res.cloudinary.com/demo/video/upload/v123/uploads/abc.mp4"
        call_kwargs = mock_upload.call_args.kwargs
        assert call_kwargs["resource_type"] == "video"
        assert call_kwargs["folder"] == "uploads"


def test_cloudinary_backend_delete_parses_public_id_and_resource_type():
    s = _settings(cloudinary_cloud_name="demo", cloudinary_api_key="key", cloudinary_api_secret="secret")
    with patch.object(storage_module, "settings", s), \
         patch("cloudinary.config"), \
         patch("cloudinary.uploader.destroy") as mock_destroy:
        backend = storage_module.CloudinaryStorageBackend()
        backend.delete("https://res.cloudinary.com/demo/image/upload/v1699999999/uploads/abc-123.jpg")

        mock_destroy.assert_called_once_with("uploads/abc-123", resource_type="image")