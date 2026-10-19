#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=============================================================="
echo "          Aether AI Studio 3.0 (AetherAgent) 系統更新程式"
echo "=============================================================="
echo ""

echo "[1/3] 正在檢查並拉取遠端最新更新..."
git stash --include-untracked >/dev/null 2>&1 || true
git pull origin main
git stash pop >/dev/null 2>&1 || true

echo "[2/3] 正在同步相依套件..."
if [ -f "backend/requirements.txt" ]; then
    python3 -m pip install -r backend/requirements.txt --quiet || true
fi

echo "[3/3] 更新成功完成！"
echo "您可以執行 ./run.sh 或 python3 start.py 啟動服務。"
