"""tests/test_config.py - Settings env var parsing (core/config.py)."""
import sys
import pathlib
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from core.config import Settings


def make(monkeypatch: pytest.MonkeyPatch, **env: str) -> Settings:
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return Settings(_env_file=None)


# - Defaults -------------------------------------------------------------------

def test_defaults_load_without_env() -> None:
    """Settings must be instantiable with no env vars - guards against import crash."""
    s = Settings(_env_file=None)
    assert s.trusted_proxy_ips == ["127.0.0.1", "::1"]
    assert "http://localhost:5173" in s.allowed_origins
    assert s.debug is False
    assert s.environment == "development"
    assert s.is_production is False
    assert s.api_key == ""
    assert s.max_body_size_bytes == 1_048_576


# - trusted_proxy_ips ----------------------------------------------------------

def test_trusted_proxy_ips_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reproduces the CI crash: TRUSTED_PROXY_IPS=127.0.0.1,::1 must not raise."""
    s = make(monkeypatch, TRUSTED_PROXY_IPS="127.0.0.1,::1")
    assert s.trusted_proxy_ips == ["127.0.0.1", "::1"]


def test_trusted_proxy_ips_single_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, TRUSTED_PROXY_IPS="10.0.0.1")
    assert s.trusted_proxy_ips == ["10.0.0.1"]


def test_trusted_proxy_ips_three_values(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, TRUSTED_PROXY_IPS="192.168.1.1,192.168.1.2,::1")
    assert s.trusted_proxy_ips == ["192.168.1.1", "192.168.1.2", "::1"]


def test_trusted_proxy_ips_strips_whitespace(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, TRUSTED_PROXY_IPS="127.0.0.1 , ::1 , 10.0.0.2")
    assert s.trusted_proxy_ips == ["127.0.0.1", "::1", "10.0.0.2"]


# - allowed_origins ------------------------------------------------------------

def test_allowed_origins_comma_separated(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, ALLOWED_ORIGINS="https://atlasmind.de,http://localhost:5173")
    assert s.allowed_origins == ["https://atlasmind.de", "http://localhost:5173"]


def test_allowed_origins_single_value(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, ALLOWED_ORIGINS="https://atlasmind.de")
    assert s.allowed_origins == ["https://atlasmind.de"]


def test_allowed_origins_strips_whitespace(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, ALLOWED_ORIGINS="https://atlasmind.de , http://localhost:5173")
    assert s.allowed_origins == ["https://atlasmind.de", "http://localhost:5173"]


# - Other fields ---------------------------------------------------------------

def test_debug_flag_true(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, DEBUG="true")
    assert s.debug is True


def test_is_production(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, ENVIRONMENT="production")
    assert s.is_production is True


def test_is_production_case_insensitive(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, ENVIRONMENT="Production")
    assert s.is_production is True


def test_max_body_size_override(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, MAX_BODY_SIZE_BYTES="2097152")
    assert s.max_body_size_bytes == 2_097_152


def test_rate_limit_override(monkeypatch: pytest.MonkeyPatch) -> None:
    s = make(monkeypatch, RATE_LIMIT_QUERY="10/minute")
    assert s.rate_limit_query == "10/minute"
