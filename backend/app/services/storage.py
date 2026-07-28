import os
import uuid
from abc import ABC, abstractmethod

from app.config import settings

MEDIA_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "media")
)


class StorageBackend(ABC):
    @abstractmethod
    def upload(self, file_bytes: bytes, filename: str, content_type: str, folder: str = "uploads") -> str:
        """Store the file under the given folder and return a publicly accessible URL."""

    @abstractmethod
    def delete(self, url: str) -> None:
        """Remove a previously uploaded file, given the URL upload() returned."""


class LocalStorageBackend(StorageBackend):
    """
    Saves files to disk and serves them via the /media static route.

    This is what runs today with zero external credentials. Swap to S3 in
    production just by setting AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
    S3_BUCKET_NAME - get_storage_backend() below picks S3 automatically once
    those are present, no code changes needed.
    """

    def __init__(self):
        os.makedirs(MEDIA_ROOT, exist_ok=True)

    def upload(self, file_bytes: bytes, filename: str, content_type: str, folder: str = "uploads") -> str:
        ext = os.path.splitext(filename)[1].lower() or ".jpg"
        key = f"{uuid.uuid4()}{ext}"
        folder_path = os.path.join(MEDIA_ROOT, folder)
        os.makedirs(folder_path, exist_ok=True)
        path = os.path.join(folder_path, key)
        with open(path, "wb") as f:
            f.write(file_bytes)
        return f"/media/{folder}/{key}"

    def delete(self, url: str) -> None:
        rel_path = url.replace("/media/", "", 1)
        path = os.path.join(MEDIA_ROOT, rel_path)
        if os.path.exists(path):
            os.remove(path)


class S3StorageBackend(StorageBackend):
    """
    Works with AWS S3 and any S3-API-compatible provider (Cloudflare R2,
    Backblaze B2, DigitalOcean Spaces, MinIO...) - just set S3_ENDPOINT_URL.
    Only instantiated when credentials are present; see get_storage_backend().
    """

    def __init__(self):
        import boto3
        self.bucket = settings.s3_bucket_name
        self.is_custom_endpoint = bool(settings.s3_endpoint_url)

        client_kwargs = {
            "aws_access_key_id": settings.aws_access_key_id,
            "aws_secret_access_key": settings.aws_secret_access_key,
            "region_name": settings.aws_region,
        }
        if self.is_custom_endpoint:
            client_kwargs["endpoint_url"] = settings.s3_endpoint_url
        self.client = boto3.client("s3", **client_kwargs)

        if settings.s3_public_base_url:
            self.public_base_url = settings.s3_public_base_url.rstrip("/")
        elif self.is_custom_endpoint:
            raise ValueError(
                "S3_PUBLIC_BASE_URL must be set when using a custom S3_ENDPOINT_URL "
                "(the public URL format isn't predictable across providers)"
            )
        else:
            self.public_base_url = f"https://{self.bucket}.s3.{settings.aws_region}.amazonaws.com"

    def upload(self, file_bytes: bytes, filename: str, content_type: str, folder: str = "uploads") -> str:
        ext = os.path.splitext(filename)[1].lower() or ".jpg"
        key = f"{folder}/{uuid.uuid4()}{ext}"
        put_kwargs = {"Bucket": self.bucket, "Key": key, "Body": file_bytes, "ContentType": content_type}
        if not self.is_custom_endpoint:
            put_kwargs["ACL"] = "public-read"
        self.client.put_object(**put_kwargs)
        return f"{self.public_base_url}/{key}"

    def delete(self, url: str) -> None:
        key = url.replace(f"{self.public_base_url}/", "", 1)
        self.client.delete_object(Bucket=self.bucket, Key=key)


def get_storage_backend() -> StorageBackend:
    if settings.aws_access_key_id and settings.aws_secret_access_key and settings.s3_bucket_name:
        return S3StorageBackend()
    return LocalStorageBackend()
