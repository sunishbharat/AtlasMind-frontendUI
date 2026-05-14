import json
from typing import Any

from pydantic import Field, field_validator
from pydantic.fields import FieldInfo
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)


class _CommaSplitMixin:
    """Override decode_complex_value to fall back to comma-splitting for non-JSON strings.

    pydantic-settings calls json.loads() on list/dict fields before field validators run,
    so TRUSTED_PROXY_IPS=127.0.0.1,::1 crashes before the validator gets a chance.
    This mixin catches the JSONDecodeError and splits by comma instead.
    """

    def decode_complex_value(self, field_name: str, field: FieldInfo, value: Any) -> Any:
        try:
            return super().decode_complex_value(field_name, field, value)  # type: ignore[misc]
        except (ValueError, json.JSONDecodeError):
            if isinstance(value, str):
                return [item.strip() for item in value.split(",") if item.strip()]
            raise


class _CommaSplitEnvSource(_CommaSplitMixin, EnvSettingsSource):
    pass


class _CommaSplitDotEnvSource(_CommaSplitMixin, DotEnvSettingsSource):
    pass


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

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        **kwargs: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        secrets = tuple(kwargs.values())
        return (
            init_settings,
            _CommaSplitEnvSource(settings_cls),
            _CommaSplitDotEnvSource(settings_cls),
            *secrets,
        )

    @field_validator("trusted_proxy_ips", "allowed_origins", mode="before")
    @classmethod
    def _parse_comma_list(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v  # type: ignore[return-value]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


# Single instance imported everywhere - never instantiate Settings() again
settings = Settings()
