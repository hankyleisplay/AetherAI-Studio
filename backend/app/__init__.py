import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_SITE_PACKAGES = _BACKEND_DIR / "site-packages"
_PROJECT_ROOT = _BACKEND_DIR.parent

if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if _SITE_PACKAGES.exists() and str(_SITE_PACKAGES) not in sys.path:
    sys.path.insert(0, str(_SITE_PACKAGES))
