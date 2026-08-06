from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql://dating_app:dating_app_pw@localhost:5432/dating_app"

    secret_key: str = "dev_only_secret_change_me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = "dating-app-media"
    # Set these two to use an S3-compatible provider other than AWS (Cloudflare
    # R2, Backblaze B2, DigitalOcean Spaces, MinIO...) with zero code changes.
    # AWS S3 works fine with both left blank.
    s3_endpoint_url: str = ""       # e.g. https://<account_id>.r2.cloudflarestorage.com
    s3_public_base_url: str = ""    # e.g. https://pub-xxxx.r2.dev or a custom domain

    # Alternative to S3/R2: set these three to use Cloudinary instead. If both
    # Cloudinary and S3 credentials are present, Cloudinary takes priority -
    # see get_storage_backend() in services/storage.py.
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""

    environment: str = "development"
    frontend_origin: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()