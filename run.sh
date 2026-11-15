#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

chmod +x install.sh start.py 2>/dev/null || true

# If backend packages or frontend dist is missing, run installer
if [ ! -d "$DIR/backend/site-packages/fastapi" ] || [ ! -f "$DIR/frontend/dist/index.html" ]; then
  echo "正在執行初始環境配置與建置..."
  ./install.sh
fi

python3 start.py "$@"
