import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = BASE_DIR / "workspace"
WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "agent_store.sqlite"

class Settings(BaseModel):
    app_name: str = "AetherAI Studio 2.0 (AetherAgent)"
    version: str = "2.0.0"
    host: str = "0.0.0.0"
    port: int = 8000
    workspace_dir: Path = WORKSPACE_DIR
    data_dir: Path = DATA_DIR
    db_path: Path = DB_PATH
    enable_shell: bool = True  # Can be disabled in config for security

settings = Settings()
