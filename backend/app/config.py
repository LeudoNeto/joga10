from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "mysql+pymysql://joga10:joga10@db:3306/joga10"

    # Auth / JWT
    secret_key: str = "change-me-in-production-please-use-a-long-random-value"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # CORS: comma-separated list of allowed origins
    cors_origins: str = "*"


settings = Settings()
