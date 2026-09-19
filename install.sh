#!/usr/bin/env bash
# ==============================================================================
#  💧 LiquidGlass Agent - 全自動環境安裝與檢查腳本 (Installation Script)
#  支援 Linux (Ubuntu/Debian/Arch/Fedora) 與 macOS
#  相容一般檔案系統 (ext4, apfs) 與無 Symlink 限制磁區 (exFAT, FAT32, NTFS, Ventoy)
# ==============================================================================

set -e

# ANSI Color Codes
BOLD="\033[1m"
RESET="\033[0m"
CYAN="\033[1;36m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
PURPLE="\033[1;35m"

ROOT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$ROOT_DIR"

print_header() {
  clear 2>/dev/null || true
  echo -e "${CYAN}"
  echo "    __    _             _      __   ________                     "
  echo "   / /   (_)___ ___  __(_)____/ /  / ____/ /___ ___________      "
  echo "  / /   / / __ \`/ / / / / __  /  / / __/ / __ \`/ ___/ ___/      "
  echo " / /___/ / /_/ / /_/ / / /_/ /  / /_/ / / /_/ (__  |__  )       "
  echo "/_____/_/\__, /\__,_/_/\__,_/   \____/_/\__,_/____/____/        "
  echo "           /_/                                                  "
  echo -e "   💧 ${BOLD}LiquidGlass Agent 全自動安裝與環境建置嚮導${RESET}"
  echo "=============================================================="
  echo ""
}

log_info() {
  echo -e "${CYAN}[資訊]${RESET} $1"
}

log_success() {
  echo -e "${GREEN}[成功]${RESET} $1"
}

log_warn() {
  echo -e "${YELLOW}[注意]${RESET} $1"
}

log_error() {
  echo -e "${RED}[錯誤]${RESET} $1"
}

check_prerequisites() {
  echo -e "${BOLD}▶ 步驟 1/5: 正在檢測主機運行環境與必要依賴...${RESET}"

  # 1. Check Python
  if command -v python3 &>/dev/null; then
    PY_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')")
    PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
    PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
      log_success "檢測到 Python 版本: ${BOLD}v$PY_VER${RESET} (符合 >= 3.10 要求)"
    else
      log_error "Python 版本過舊: v$PY_VER，建議升級至 Python 3.10 以上。"
      exit 1
    fi
  else
    log_error "未檢測到 Python 3！請先安裝 Python 3.10+ (sudo apt install python3 python3-pip)"
    exit 1
  fi

  # 2. Check Node.js and npm
  if command -v node &>/dev/null && command -v npm &>/dev/null; then
    NODE_VER=$(node -v)
    NPM_VER=$(npm -v)
    log_success "檢測到 Node.js: ${BOLD}$NODE_VER${RESET}, npm: ${BOLD}v$NPM_VER${RESET}"
  else
    log_warn "未檢測到 Node.js / npm。若已有前端編譯產物 (frontend/dist) 仍可運行，若需重新編譯前端請安裝 Node.js。"
  fi

  # 3. Check Local Ollama Service
  if command -v ollama &>/dev/null; then
    log_success "檢測到本機已安裝 Ollama 指令列工具"
    if curl -s http://localhost:11434/api/tags &>/dev/null; then
      log_success "Ollama 服務現正於 ${BOLD}http://localhost:11434${RESET} 運行中"
    else
      log_warn "Ollama 未啟動，若要使用本地模型可於背景執行: ${BOLD}ollama serve${RESET}"
    fi
  else
    log_info "本機未安裝 Ollama（若僅使用雲端 OpenAI / Gemini / Claude 模型則非必要）"
  fi
  echo ""
}

test_symlink_capability() {
  echo -e "${BOLD}▶ 步驟 2/5: 正在探測磁區檔案系統相容性...${RESET}"
  TEST_LINK="_symlink_test_tmp"
  rm -f "$TEST_LINK" 2>/dev/null || true
  
  CAN_SYMLINK=false
  if ln -s "$ROOT_DIR" "$TEST_LINK" 2>/dev/null; then
    CAN_SYMLINK=true
    rm -f "$TEST_LINK"
    log_success "磁區檔案系統支援符號連結 (Symlinks)"
  else
    log_warn "目前專案位於無符號連結支援的磁區 (例如 exFAT/FAT32/NTFS/Ventoy)"
    log_info "安裝腳本將自動啟用 ${BOLD}--no-bin-links${RESET} 與獨立 package target 模式，確保穩定運行！"
  fi
  echo ""
}

install_python_dependencies() {
  echo -e "${BOLD}▶ 步驟 3/5: 正在配置 Python 後端模組庫與工具箱...${RESET}"
  
  SITE_PACKAGES="$ROOT_DIR/backend/site-packages"
  mkdir -p "$SITE_PACKAGES" "$ROOT_DIR/backend/workspace" "$ROOT_DIR/backend/workspace/uploads" "$ROOT_DIR/backend/data"

  log_info "正在安裝/更新後端依賴套件 (FastAPI, Uvicorn, Pydantic, HTTPX, DuckDuckGo 等)..."
  
  python3 -m pip install --upgrade --break-system-packages \
    --target "$SITE_PACKAGES" \
    -r "$ROOT_DIR/backend/requirements.txt" \
    --quiet 2>&1 | grep -v "already satisfied" || true

  log_success "後端相依模組安裝完成！"
  echo ""
}

build_frontend() {
  echo -e "${BOLD}▶ 步驟 4/5: 正在建置 Liquid Glass 前端介面...${RESET}"
  
  if command -v npm &>/dev/null; then
    cd "$ROOT_DIR/frontend"
    log_info "安裝前端 NPM 套件依賴..."
    
    if [ "$CAN_SYMLINK" = false ]; then
      npm install --no-bin-links --silent 2>&1 | tail -n 5 || true
    else
      npm install --silent 2>&1 | tail -n 5 || true
    fi

    log_info "打包前端生產環境產物 (Vite + TypeScript)..."
    npm run build --silent
    cd "$ROOT_DIR"
    log_success "前端 Liquid Glass 介面打包成功 (frontend/dist)！"
  else
    if [ -d "$ROOT_DIR/frontend/dist" ]; then
      log_success "發現既有前端編譯產物，將直接沿用託管。"
    else
      log_error "缺少 Node.js 且無前端編譯產物，請先安裝 node / npm！"
      exit 1
    fi
  fi
  echo ""
}

run_verification() {
  echo -e "${BOLD}▶ 步驟 5/5: 正在執行全系統整合測試...${RESET}"
  python3 "$ROOT_DIR/test_backend.py"
  echo ""
}

create_desktop_shortcut() {
  if [ -f "$ROOT_DIR/create_shortcut.sh" ]; then
    bash "$ROOT_DIR/create_shortcut.sh"
  fi
}

main() {
  print_header
  check_prerequisites
  test_symlink_capability
  install_python_dependencies
  build_frontend
  run_verification
  create_desktop_shortcut

  echo -e "${CYAN}==============================================================${RESET}"
  echo -e "${GREEN}${BOLD}🎉 LiquidGlass Agent 全自動安裝與配置成功！${RESET}"
  echo -e "${CYAN}==============================================================${RESET}"
  echo -e "您可以透過以下指令立即啟動服務："
  echo ""
  echo -e "  ${BOLD}./run.sh${RESET}       # 立即啟動並自動開啟瀏覽器"
  echo -e "  ${BOLD}python3 start.py${RESET}  # Python 跨平台直接啟動"
  echo -e "  ${BOLD}python3 start.py --dev${RESET} # 開啟開發者前端熱重載模式"
  echo ""
  echo -e "預設瀏覽器訪問網址: ${BOLD}${CYAN}http://localhost:8000${RESET}"
  echo ""
}

main "$@"
