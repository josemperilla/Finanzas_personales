"""Hash de contraseñas (bcrypt) y emisión/validación de JWT (access + refresh)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from api.settings import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def _create_token(sub: str, token_type: str, expires_delta: timedelta) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    s = get_settings()
    return _create_token(str(user_id), "access", timedelta(minutes=s.access_token_ttl_min))


def create_refresh_token(user_id: int) -> str:
    s = get_settings()
    return _create_token(str(user_id), "refresh", timedelta(days=s.refresh_token_ttl_days))


def decode_token(token: str, expected_type: str) -> int | None:
    """Devuelve el user_id si el token es válido y del tipo esperado, si no None."""
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    sub = payload.get("sub")
    return int(sub) if sub is not None else None
