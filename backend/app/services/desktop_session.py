"""Stop the server when the desktop window closes.

`start.py --desktop` opens the app in a Chromium app window and runs the server in a hidden console. Closing the
window used to leave the server running; the next launch found the port busy, moved to the next one, and the
leftover servers piled up.

The desktop page (opened with ?desktop=1) sends a heartbeat every 20 seconds and a "closing" beacon when it is
unloaded. The server stops 15 seconds after a closing beacon unless a heartbeat arrives in between (a reload sends
one right away), or when no heartbeat has arrived for 3 minutes (background windows have their timers slowed to
about once a minute, so this leaves plenty of room). Only active when start.py sets AETHER_DESKTOP_MODE=1.
"""
import asyncio
import os
import time
from typing import Callable, Optional

CLOSE_GRACE_SECONDS = 15
HEARTBEAT_TIMEOUT_SECONDS = 180

_shutdown: Optional[Callable[[], None]] = None
_last_heartbeat: Optional[float] = None
_closing_at: Optional[float] = None


def enabled() -> bool:
    return os.environ.get("AETHER_DESKTOP_MODE") == "1"


def set_shutdown_handler(callback: Callable[[], None]) -> None:
    global _shutdown
    _shutdown = callback


def heartbeat() -> None:
    global _last_heartbeat, _closing_at
    _last_heartbeat = time.time()
    _closing_at = None


def closing() -> None:
    global _closing_at
    _closing_at = time.time()


def _should_stop(now: float) -> Optional[str]:
    if _last_heartbeat is None:
        return None  # the window has not connected yet; never stop before it does
    if _closing_at is not None and now - _closing_at >= CLOSE_GRACE_SECONDS:
        return "desktop window closed"
    if now - _last_heartbeat >= HEARTBEAT_TIMEOUT_SECONDS:
        return "no heartbeat from the desktop window"
    return None


async def watch() -> None:
    if not enabled():
        return
    while True:
        await asyncio.sleep(2)
        reason = _should_stop(time.time())
        if reason:
            print(f"\n\033[33m[*] {reason}，正在關閉 Aether AI Studio 伺服器...\033[0m")
            if _shutdown:
                _shutdown()
            return
