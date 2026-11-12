"""Remote-access PIN and login sessions.

The PIN used to be stored as plain text and handed back to the browser as the access token, so anything that could
read the token (localStorage, a copied cookie) had the PIN itself. Now:

- the PIN is stored as a salted PBKDF2 hash (an old plain-text value is converted on its next successful use);
- a successful PIN check issues a random session token; only its SHA-256 and expiry are stored;
- changing or disabling the PIN ends every session.
"""
import hashlib
import hmac
import secrets
import time
from typing import Dict, Optional

from backend.app.storage.database import db

PIN_SETTING = "web_access_pin"
SESSIONS_SETTING = "web_access_sessions"

PBKDF2_ITERATIONS = 120_000
SESSION_TTL_SECONDS = 30 * 86400
MAX_SESSIONS = 50

# Header-based PIN checks (scripts sending x-access-pin) would otherwise run PBKDF2 on every request
_verified_cache: Dict[str, bool] = {}


def _hash_pin(pin: str, salt: Optional[str] = None, iterations: int = PBKDF2_ITERATIONS) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), bytes.fromhex(salt), iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt}${digest}"


def _stored_pin() -> Optional[str]:
    value = db.get_setting(PIN_SETTING)
    return value if isinstance(value, str) and value else None


def pin_configured() -> bool:
    return _stored_pin() is not None


def check_pin(candidate: Optional[str]) -> bool:
    """Compare a PIN with the stored one. A legacy plain-text PIN is upgraded to a hash when it matches."""
    stored = _stored_pin()
    candidate = (candidate or "").strip()
    if not stored or not candidate:
        return False

    if not stored.startswith("pbkdf2_sha256$"):
        ok = hmac.compare_digest(candidate.encode("utf-8"), stored.encode("utf-8"))
        if ok:
            db.set_setting(PIN_SETTING, _hash_pin(candidate))
        return ok

    cache_key = hashlib.sha256(f"{stored}\x00{candidate}".encode("utf-8")).hexdigest()
    if cache_key in _verified_cache:
        return _verified_cache[cache_key]
    try:
        _, iterations, salt, expected = stored.split("$", 3)
        actual = _hash_pin(candidate, salt, int(iterations)).split("$", 3)[3]
        ok = hmac.compare_digest(actual, expected)
    except (ValueError, IndexError):
        ok = False
    if len(_verified_cache) > 256:
        _verified_cache.clear()
    _verified_cache[cache_key] = ok
    return ok


def set_pin(new_pin: Optional[str]) -> None:
    """Store a new PIN (None disables protection). Every existing login session ends."""
    _verified_cache.clear()
    db.set_setting(PIN_SETTING, _hash_pin(new_pin) if new_pin else None)
    db.set_setting(SESSIONS_SETTING, {})


def _token_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _live_sessions() -> Dict[str, float]:
    sessions = db.get_setting(SESSIONS_SETTING) or {}
    if not isinstance(sessions, dict):
        return {}
    now = time.time()
    return {k: v for k, v in sessions.items() if isinstance(v, (int, float)) and v > now}


def issue_token() -> str:
    token = secrets.token_urlsafe(32)
    sessions = _live_sessions()
    sessions[_token_key(token)] = time.time() + SESSION_TTL_SECONDS
    if len(sessions) > MAX_SESSIONS:
        # Keep the sessions that expire last (the most recently issued)
        sessions = dict(sorted(sessions.items(), key=lambda kv: kv[1])[-MAX_SESSIONS:])
    db.set_setting(SESSIONS_SETTING, sessions)
    return token


def token_valid(token: Optional[str]) -> bool:
    if not token:
        return False
    expiry = _live_sessions().get(_token_key(token))
    return bool(expiry)
