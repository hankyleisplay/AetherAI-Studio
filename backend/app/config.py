import os
from pathlib import Path
from typing import Optional
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


class Settings(BaseModel):
    app_name: str = "Aether AI Studio 3.7.1 (AetherAgent)"
    version: str = "3.7.1"
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
