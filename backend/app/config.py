import os
import sys
from pathlib import Path
from typing import Dict, Optional
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = BASE_DIR / "workspace"
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "agent_store.sqlite"


def get_effective_workspace_dir(project_name: Optional[str] = None) -> Path:
    """
    Returns the active project directory if a project is active or specified;
    otherwise falls back to the default WORKSPACE_DIR.
    """
    try:
        from backend.app.storage.database import db
        target_project = project_name or db.get_setting("active_project")
        if target_project:
            projects_meta = db.get_setting("projects_metadata") or {}
            if target_project in projects_meta:
                cand_str = projects_meta[target_project].get("path", "")
                if cand_str:
                    cand = Path(cand_str).resolve()
                    if cand.exists() and cand.is_dir():
                        return cand
            cand = (WORKSPACE_DIR / "projects" / target_project).resolve()
            if cand.exists() and cand.is_dir():
                return cand
    except Exception:
        pass
    return WORKSPACE_DIR.resolve()


def child_process_env(**extra: str) -> Dict[str, str]:
    """Environment for commands the app runs for the user (terminal, agent tools).

    `python` and `pip` must mean the interpreter running Aether. On Windows PATH often has no Python at all, or only
    the Microsoft Store placeholder (the launcher then starts Aether with a full path), so `python main.py` in the
    built-in terminal failed with "not recognized". Put this interpreter's folder (and its Scripts folder) first.
    """
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    interpreter_dir = os.path.dirname(os.path.abspath(sys.executable))
    extra_dirs = [interpreter_dir]
    if os.name == "nt":
        extra_dirs.append(os.path.join(interpreter_dir, "Scripts"))
    current = env.get("PATH") or env.get("Path") or ""
    prefix = [d for d in extra_dirs if os.path.isdir(d)]
    prefix_keys = {os.path.normcase(os.path.normpath(d)) for d in prefix}
    # Keep it first even when it is already somewhere later in PATH, so it wins over other Pythons
    rest = [p for p in current.split(os.pathsep) if p and os.path.normcase(os.path.normpath(p)) not in prefix_keys]
    env.pop("Path", None)
    env["PATH"] = os.pathsep.join(prefix + rest)
    env.update(extra)
    return env


def shell_command_in(command: str, cwd: str) -> str:
    r"""A `shell=True` command line that really runs inside `cwd`.

    cmd.exe cannot use a UNC path (\\server\share\...) as its working directory; it silently falls back to
    C:\Windows. That is what a project on a mapped network drive resolves to. `pushd` maps a temporary drive letter.
    """
    if os.name == "nt" and str(cwd).startswith("\\\\"):
        return f'pushd "{cwd}" && {command}'
    return command


class Settings(BaseModel):
    app_name: str = "Aether AI Studio 4.2.1 (AetherAgent)"
    version: str = "4.2.1"
    host: str = "0.0.0.0"
    port: int = 8000
    base_workspace_dir: Path = WORKSPACE_DIR
    data_dir: Path = DATA_DIR
    db_path: Path = DB_PATH
    enable_shell: bool = True  # Can be disabled in config for security

    @property
    def workspace_dir(self) -> Path:
        return get_effective_workspace_dir()

    @workspace_dir.setter
    def workspace_dir(self, val: Path):
        self.base_workspace_dir = Path(val)


settings = Settings()
