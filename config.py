import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _db_url():
    """Make a relative sqlite path absolute so seed.py and app.py always use the same file."""
    url = os.getenv("DATABASE_URL", "mysql+pymysql://root:password@localhost:3306/pharmasense")
    prefix = "sqlite:///"
    if url.startswith(prefix) and not url.startswith("sqlite:////") and ":memory:" not in url:
        url = prefix + os.path.join(_ROOT, url[len(prefix):]).replace("\\", "/")
    return url


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-change-me")
    SQLALCHEMY_DATABASE_URI = _db_url()
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # Business rules (tweak here, not in code)
    NEAR_EXPIRY_DAYS = 90       # "Medium" risk window
    CRITICAL_EXPIRY_DAYS = 30   # "High" risk window
    DEMAND_WINDOW_DAYS = 60     # history used for forecasting
    FORECAST_DAYS = 30
    INTERACTION_LOOKBACK_DAYS = 30


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_ENGINE_OPTIONS = {}
