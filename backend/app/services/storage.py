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


class CloudinaryStorageBackend(StorageBackend):
    """
    Uses Cloudinary's free tier (25 combined credits/month across storage,
    bandwidth, and transformations - no credit card required). Good fit for
    a small/personal deployment; note the credit pool is shared, so a busy
    app burns through it via bandwidth faster than a flat-storage provider
    like R2 (which has no egress fees at all). Swap back to S3/R2 any time
    by removing the CLOUDINARY_* env vars - see get_storage_backend() below.
    """

    def __init__(self):
        import cloudinary

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
            secure=True,
        )
        self.cloudinary = cloudinary

    def upload(self, file_bytes: bytes, filename: str, content_type: str, folder: str = "uploads") -> str:
        import cloudinary.uploader

        resource_type = "video" if content_type.startswith("video/") else "image"
        public_id = str(uuid.uuid4())
        result = cloudinary.uploader.upload(
            file_bytes,
            folder=folder,
            public_id=public_id,
            resource_type=resource_type,
        )
        return result["secure_url"]

    def delete(self, url: str) -> None:
        import cloudinary.uploader

        # Cloudinary URLs look like:
        # https://res.cloudinary.com/<cloud_name>/<resource_type>/upload/v<version>/<folder>/<public_id>.<ext>
        try:
            after_cloud_name = url.split(f"/{settings.cloudinary_cloud_name}/", 1)[1]
            resource_type = after_cloud_name.split("/", 1)[0]  # "image" or "video"
            path_after_upload = after_cloud_name.split("/upload/", 1)[1]
            # strip the leading "v<version>/" segment and the file extension
            parts = path_after_upload.split("/", 1)
            without_version = parts[1] if len(parts) > 1 and parts[0].startswith("v") and parts[0][1:].isdigit() else path_after_upload
            public_id = os.path.splitext(without_version)[0]
        except IndexError:
            return  # not a Cloudinary URL we recognize; nothing safe to delete
        cloudinary.uploader.destroy(public_id, resource_type=resource_type)


def get_storage_backend() -> StorageBackend:
    if settings.cloudinary_cloud_name and settings.cloudinary_api_key and settings.cloudinary_api_secret:
        return CloudinaryStorageBackend()
    if settings.aws_access_key_id and settings.aws_secret_access_key and settings.s3_bucket_name:
        return S3StorageBackend()
    return LocalStorageBackend()