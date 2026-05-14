from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Proxy trust - IPs whose X-Forwarded-For header is trusted
    trusted_proxy_ips: list[str] = Field(default=["127.0.0.1", "::1"])

    # Rate limits - all values come from env, zero hardcoded in application code
    rate_limit_default:   str = Field(default="30/minute")
    rate_limit_query:     str = Field(default="6/minute")
    rate_limit_aggregate: str = Field(default="30/minute")
    rate_limit_event:     str = Field(default="30/minute")
    rate_limit_meta:      str = Field(default="20/minute")
    rate_limit_storage_uri: str = Field(default="memory://")  # swap to redis:// in prod

    # Body size
    max_body_size_bytes: int = Field(default=1_048_576)  # 1 MB

    # Auth
    api_key: str = Field(default="")

    # CORS
    allowed_origins: list[str] = Field(default=["http://localhost:5173", "http://127.0.0.1:5173"])

    # App
    environment: str = Field(default="development")
    debug: bool      = Field(default=False)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


# Single instance imported everywhere - never instantiate Settings() again
settings = Settings()
