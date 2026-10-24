// Aether AI Studio 4.0 - Tauri Launcher Logic with Custom Controls, Hardware-Saving Mode, Launcher Self-Update & Full i18n

const I18N = {
  "zh-TW": {
    app_subtitle: "次世代獨立原生桌面代理系統 • 官方正式版 (Tauri + Rust)",
    update_checking_title: "自動更新檢查中...",
    update_checking_desc: "正在向官方 GitHub 驗證最新發行版本與倉庫狀態",
    update_latest_title: "已是最新正式版 v{version}",
    update_latest_desc: "GitHub 遠端發行與本地版本一致，無需更新",
    btn_recheck: "🔄 重新檢查",
    update_available_title: "發現新版本 v{version}！",
    btn_update_now: "⚡ 立即更新專案",
    btn_update_full: "⚡ 一鍵全面更新 (專案與啟動器)",
    btn_updating: "正在更新中...",
    btn_update_launcher: "🚀 更新啟動器",
    btn_updating_launcher: "正在下載並更換啟動器...",
    launcher_update_success: "✅ 啟動器已更新完畢，即將自動重新啟動！",
    launcher_update_fail: "啟動器更新失敗: ",
    update_success_title: "已成功更新至最新版！",
    update_failed: "更新失敗: ",
    update_error_title: "離線或更新檢查略過",
    install_tag: "自動安裝精靈 (Setup Wizard)",
    install_title: "一鍵自動安裝 Aether AI Studio 4.0",
    install_desc: "尚未偵測到核心系統。點擊按鈕將自動從官方 GitHub 下載核心檔案、自動配置 Python 相依套件並建立桌面捷徑！",
    btn_install_now: "⚡ 一鍵自動安裝與配置",
    btn_installing: "⏳ 正在自動下載核心檔案與安裝依賴套件 (請稍候)...",
    install_success: "🎉 Aether AI Studio 4.0 核心檔案與相依套件已自動安裝完成！",
    install_failed: "安裝失敗: ",
    confirm_install: "尚未安裝 Aether AI Studio 核心檔案，是否立即執行一鍵自動安裝？",
    btn_retry: "重試",
    env_project_dir: "📂 專案目錄:",
    env_python: "🐍 Python:",
    env_detecting: "偵測中...",
    env_project_not_found: "未找到專案目錄！",
    env_python_ready: "已就緒 (Python 3)",
    env_python_not_found: "未偵測到 Python！",
    env_port: "監聽埠號 (Port):",
    env_core_ready: "核心環境就緒",
    env_core_missing: "環境缺失",
    eco_mode_label: "⚡ 節省硬體消耗模式 (適合低配置 / 筆電)",
    eco_mode_desc: "降低記憶體與 CPU 佔用、停用高耗能 GPU 特效，推薦文書機或筆電開啟",
    stepper_up_title: "增加埠號 (+1)",
    stepper_down_title: "減少埠號 (-1)",
    section_mode_title: "請選擇啟動模式：",
    tag_recommend: "推薦首選",
    tag_cli: "即時日誌",
    desktop_title: "獨立原生桌面版",
    desktop_desc: "獨立原生視窗應用 • 沉浸專注無干擾 • 實時推論 HUD 與即時畫布",
    desktop_btn: "立即啟動桌面版",
    desktop_launching: "正在啟動原生獨立桌面版...",
    desktop_success: "✅ 原生獨立桌面視窗已開啟",
    cli_title: "終端命令列版",
    cli_desc: "在獨立終端視窗運行伺服器 • 實時監控 22 大工具調用日誌與推理進度",
    cli_btn: "啟動終端版",
    cli_launching: "正在開啟獨立終端命令列視窗...",
    cli_success: "✅ 終端視窗已啟動，實時日誌監控中",
    browser_title: "一般網頁瀏覽器版",
    browser_desc: "啟動本地後端伺服器，並自動在預設瀏覽器分頁開啟使用",
    browser_btn: "開啟瀏覽器",
    browser_launching: "正在啟動伺服器並開啟瀏覽器...",
    browser_success: "✅ 伺服器就緒，已開啟瀏覽器",
    btn_launching: "啟動中...",
    footer_shortcut: "⭐ 建立桌面捷徑",
    footer_open_folder: "📂 開啟專案目錄",
    footer_update_launcher: "🚀 自動更新啟動器",
    footer_health_check: "🩺 環境健康檢查",
    footer_status_standby: "Aether AI Studio v{version} Official Release • 系統狀態：待命中",
    shortcut_success: "⭐ 已成功在您的 Windows 桌面建立「Aether AI Studio 4.0」捷徑！",
    shortcut_fail: "建立捷徑失敗: ",
    open_folder_fail: "開啟目錄失敗: ",
    health_check_fail: "啟動診斷失敗: ",
    launch_error: "啟動出錯: ",
    btn_close_all_clients: "一鍵關閉所有客戶端",
    btn_closing_clients: "正在終止客戶端與伺服器進程...",
    close_all_success: "🛑 已成功終止 {count} 個相關客戶端與背景進程！",
    close_all_none: "✅ 目前沒有檢測到正在運行的相關客戶端或背景進程。",
    close_all_fail: "終止進程失敗: "
  },
  "zh-CN": {
    app_subtitle: "次世代独立原生桌面代理系统 • 官方正式版 (Tauri + Rust)",
    update_checking_title: "自动更新检查中...",
    update_checking_desc: "正在向官方 GitHub 验证最新发行版本与仓库状态",
    update_latest_title: "已是最新正式版 v{version}",
    update_latest_desc: "GitHub 远端发行与本地版本一致，无需更新",
    btn_recheck: "🔄 重新检查",
    update_available_title: "发现新版本 v{version}！",
    btn_update_now: "⚡ 立即更新项目",
    btn_update_full: "⚡ 一键全面更新 (项目与启动器)",
    btn_updating: "正在更新中...",
    btn_update_launcher: "🚀 更新启动器",
    btn_updating_launcher: "正在下载并更换启动器...",
    launcher_update_success: "✅ 启动器已更新完毕，即将自动重新启动！",
    launcher_update_fail: "启动器更新失败: ",
    update_success_title: "已成功更新至最新版！",
    update_failed: "更新失败: ",
    update_error_title: "离线或更新检查略过",
    install_tag: "自动安装精灵 (Setup Wizard)",
    install_title: "一键自动安装 Aether AI Studio 4.0",
    install_desc: "尚未检测到核心系统。点击按钮将自动从官方 GitHub 下载核心文件、配置 Python 依赖并创建桌面快捷方式！",
    btn_install_now: "⚡ 一键自动安装与配置",
    btn_installing: "⏳ 正在自动下载核心文件与安装依赖包 (请稍候)...",
    install_success: "🎉 Aether AI Studio 4.0 核心文件与依赖包已自动安装完成！",
    install_failed: "安装失败: ",
    confirm_install: "尚未安装 Aether AI Studio 核心文件，是否立即执行一键自动安装？",
    btn_retry: "重试",
    env_project_dir: "📂 项目目录:",
    env_python: "🐍 Python:",
    env_detecting: "检测中...",
    env_project_not_found: "未找到项目目录！",
    env_python_ready: "已就绪 (Python 3)",
    env_python_not_found: "未检测到 Python！",
    env_port: "监听端口 (Port):",
    env_core_ready: "核心环境就绪",
    env_core_missing: "环境缺失",
    eco_mode_label: "⚡ 节省硬件消耗模式 (适合低配置 / 笔记本)",
    eco_mode_desc: "降低内存与 CPU 占用、停用高耗能 GPU 特效，推荐轻薄本或老旧电脑开启",
    stepper_up_title: "增加端口号 (+1)",
    stepper_down_title: "减少端口号 (-1)",
    section_mode_title: "请选择启动模式：",
    tag_recommend: "推荐首选",
    tag_cli: "实时日志",
    desktop_title: "独立原生桌面版",
    desktop_desc: "独立原生窗口应用 • 沉浸专注无干扰 • 实时推理 HUD 与即时画布",
    desktop_btn: "立即启动桌面版",
    desktop_launching: "正在启动原生独立桌面版...",
    desktop_success: "✅ 原生独立桌面窗口已开启",
    cli_title: "终端命令行版",
    cli_desc: "在独立终端窗口运行服务器 • 实时监控 22 大工具调用日志与推理进度",
    cli_btn: "启动终端版",
    cli_launching: "正在开启独立终端命令行窗口...",
    cli_success: "✅ 终端窗口已启动，实时日志监控中",
    browser_title: "一般网页浏览器版",
    browser_desc: "启动本地后端服务器，并自动在默认浏览器标签页打开使用",
    browser_btn: "开启浏览器",
    browser_launching: "正在启动服务器并开启浏览器...",
    browser_success: "✅ 服务器就绪，已开启浏览器",
    btn_launching: "启动中...",
    footer_shortcut: "⭐ 创建桌面快捷方式",
    footer_open_folder: "📂 打开项目目录",
    footer_update_launcher: "🚀 自动更新启动器",
    footer_health_check: "🩺 环境健康检查",
    footer_status_standby: "Aether AI Studio v{version} Official Release • 系统状态：待命中",
    shortcut_success: "⭐ 已成功在您的 Windows 桌面创建「Aether AI Studio 4.0」快捷方式！",
    shortcut_fail: "创建快捷方式失败: ",
    open_folder_fail: "打开目录失败: ",
    health_check_fail: "启动诊断失败: ",
    launch_error: "启动出错: ",
    btn_close_all_clients: "一键关闭所有客户端",
    btn_closing_clients: "正在终止客户端与服务器进程...",
    close_all_success: "🛑 已成功终止 {count} 个相关客户端与后台进程！",
    close_all_none: "✅ 目前没有检测到正在运行的相关客户端或后台进程。",
    close_all_fail: "终止进程失败: "
  },
  "en": {
    app_subtitle: "Next-Gen Autonomous Desktop AI Agent • Official Release (Tauri + Rust)",
    update_checking_title: "Checking for updates...",
    update_checking_desc: "Verifying latest release and repository status on GitHub",
    update_latest_title: "Up to date (v{version})",
    update_latest_desc: "Remote GitHub release matches local version, no update needed",
    btn_recheck: "🔄 Recheck",
    update_available_title: "New Version Available: v{version}!",
    btn_update_now: "⚡ Update Project",
    btn_update_full: "⚡ One-Click Full Update (App & Launcher)",
    btn_updating: "Updating...",
    btn_update_launcher: "🚀 Update Launcher",
    btn_updating_launcher: "Downloading new launcher...",
    launcher_update_success: "✅ Launcher updated, restarting now!",
    launcher_update_fail: "Launcher update failed: ",
    update_success_title: "Successfully updated to latest version!",
    update_failed: "Update failed: ",
    update_error_title: "Offline or update check skipped",
    install_tag: "Setup Wizard",
    install_title: "One-Click Install Aether AI Studio 4.0",
    install_desc: "Core system not detected. Click below to automatically download core files from GitHub, configure Python dependencies, and create desktop shortcut!",
    btn_install_now: "⚡ One-Click Auto Install",
    btn_installing: "⏳ Downloading core files & installing dependencies (Please wait)...",
    install_success: "🎉 Aether AI Studio 4.0 core files and dependencies installed successfully!",
    install_failed: "Installation failed: ",
    confirm_install: "Core files not found. Would you like to run one-click auto installation now?",
    btn_retry: "Retry",
    env_project_dir: "📂 Project Dir:",
    env_python: "🐍 Python:",
    env_detecting: "Detecting...",
    env_project_not_found: "Project directory not found!",
    env_python_ready: "Ready (Python 3)",
    env_python_not_found: "Python not found!",
    env_port: "Port:",
    env_core_ready: "Core Environment Ready",
    env_core_missing: "Environment Missing",
    eco_mode_label: "⚡ Hardware-Saving Mode (Low-Resource / Laptop)",
    eco_mode_desc: "Reduces RAM & CPU usage, disables heavy GPU compositing, optimal for low-spec PCs",
    stepper_up_title: "Increase Port (+1)",
    stepper_down_title: "Decrease Port (-1)",
    section_mode_title: "Select Launch Mode:",
    tag_recommend: "Recommended",
    tag_cli: "Live Logs",
    desktop_title: "Standalone Desktop App",
    desktop_desc: "Dedicated native window • Immersive & distraction-free • Real-time HUD & live canvas",
    desktop_btn: "Launch Desktop",
    desktop_launching: "Launching standalone desktop app...",
    desktop_success: "✅ Native desktop window opened",
    cli_title: "Terminal CLI Mode",
    cli_desc: "Runs server in a dedicated console window • Real-time logs for all 22 tools & reasoning",
    cli_btn: "Launch CLI",
    cli_launching: "Opening dedicated terminal window...",
    cli_success: "✅ Terminal launched, monitoring live logs",
    browser_title: "Web Browser Mode",
    browser_desc: "Starts local backend server and automatically opens your default web browser",
    browser_btn: "Launch Browser",
    browser_launching: "Starting server and opening browser...",
    browser_success: "✅ Server ready, browser opened",
    btn_launching: "Launching...",
    footer_shortcut: "⭐ Create Desktop Shortcut",
    footer_open_folder: "📂 Open Project Folder",
    footer_update_launcher: "🚀 Update Launcher",
    footer_health_check: "🩺 System Health Check",
    footer_status_standby: "Aether AI Studio v{version} Official Release • Status: Standby",
    shortcut_success: "⭐ Successfully created 'Aether AI Studio 4.0' shortcut on Desktop!",
    shortcut_fail: "Failed to create shortcut: ",
    open_folder_fail: "Failed to open folder: ",
    health_check_fail: "Failed to launch health check: ",
    launch_error: "Launch error: ",
    btn_close_all_clients: "Close All Clients",
    btn_closing_clients: "Terminating client & server processes...",
    close_all_success: "🛑 Successfully terminated {count} client & background processes!",
    close_all_none: "✅ No active client or background processes detected.",
    close_all_fail: "Failed to terminate processes: "
  },
  "ja": {
    app_subtitle: "次世代自律型デスクトップAIエージェント • 公式正式版 (Tauri + Rust)",
    update_checking_title: "アップデートを確認中...",
    update_checking_desc: "公式 GitHub で最新リリースとリポジトリの状態を確認しています",
    update_latest_title: "最新バージョンです (v{version})",
    update_latest_desc: "リモートのリリースとローカルのバージョンは一致しています",
    btn_recheck: "🔄 再確認",
    update_available_title: "新バージョン v{version} が利用可能！",
    btn_update_now: "⚡ プロジェクト更新",
    btn_updating: "更新中...",
    btn_update_launcher: "🚀 起動ツール更新",
    btn_updating_launcher: "新しい起動ツールをダウンロード中...",
    launcher_update_success: "✅ 起動ツールが更新されました。再起動中...",
    launcher_update_fail: "起動ツールの更新に失敗しました: ",
    update_success_title: "最新バージョンへの更新が完了しました！",
    update_failed: "更新失敗: ",
    update_error_title: "オフラインまたは更新チェックをスキップ",
    install_tag: "セットアップウィザード",
    install_title: "Aether AI Studio 4.0 ワンクリック自動インストール",
    install_desc: "コアシステムが検出されません。ボタンをクリックするとGitHubから自動ダウンロードし、Python環境とショートカットを設定します！",
    btn_install_now: "⚡ ワンクリック自動インストール",
    btn_installing: "⏳ コアファイルをダウンロードし依存関係をインストール中...",
    install_success: "🎉 Aether AI Studio 4.0 のインストールが完了しました！",
    install_failed: "インストール失敗: ",
    confirm_install: "コアファイルが見つかりません。今すぐワンクリック自動インストールを実行しますか？",
    btn_retry: "再試行",
    env_project_dir: "📂 プロジェクト:",
    env_python: "🐍 Python:",
    env_detecting: "検出中...",
    env_project_not_found: "プロジェクトが見つかりません！",
    env_python_ready: "準備完了 (Python 3)",
    env_python_not_found: "Pythonが見つかりません！",
    env_port: "ポート (Port):",
    env_core_ready: "コア環境準備完了",
    env_core_missing: "環境が不足しています",
    eco_mode_label: "⚡ 省電力・低負荷モード (低スペックPC / ノートPC向け)",
    eco_mode_desc: "メモリとCPU消費を抑え、高負荷なGPU描画を無効化します",
    stepper_up_title: "ポート番号を増やす (+1)",
    stepper_down_title: "ポート番号を減らす (-1)",
    section_mode_title: "起動モードを選択してください：",
    tag_recommend: "おすすめ",
    tag_cli: "ライブログ",
    desktop_title: "独立デスクトップ版",
    desktop_desc: "独立したネイティブウィンドウ • 没入感のある作業空間 • リアルタイムHUD＆キャンバス",
    desktop_btn: "デスクトップ版を起動",
    desktop_launching: "独立デスクトップ版を起動しています...",
    desktop_success: "✅ デスクトップウィンドウが開きました",
    cli_title: "ターミナルCLI版",
    cli_desc: "専用ターミナルでサーバーを実行 • 22種類のツール実行と推論ログをリアルタイム監視",
    cli_btn: "CLI版を起動",
    cli_launching: "専用ターミナルウィンドウを開いています...",
    cli_success: "✅ ターミナルでサーバーが起動しました",
    browser_title: "Webブラウザ版",
    browser_desc: "ローカルサーバーを起動し、デフォルトのブラウザで自動的に開きます",
    browser_btn: "ブラウザを起動",
    browser_launching: "サーバーを起動しブラウザを開いています...",
    browser_success: "✅ サーバー準備完了、ブラウザを開きました",
    btn_launching: "起動中...",
    footer_shortcut: "⭐ デスクトップショートカット作成",
    footer_open_folder: "📂 プロジェクトを開く",
    footer_reinstall: "📦 コアを再インストール/修復",
    confirm_reinstall: "Aether AI Studio のコアファイルと依存関係を再インストール/修復しますか？",
    footer_update_launcher: "🚀 起動ツール更新",
    footer_health_check: "🩺 システム健全性診断",
    footer_status_standby: "Aether AI Studio v{version} Official Release • 状態：待機中",
    shortcut_success: "⭐ デスクトップに「Aether AI Studio 4.0」ショートカットを作成しました！",
    shortcut_fail: "ショートカット作成失敗: ",
    open_folder_fail: "フォルダを開けませんでした: ",
    health_check_fail: "診断の起動に失敗しました: ",
    launch_error: "起動エラー: ",
    btn_close_all_clients: "全クライアントを一括終了",
    btn_closing_clients: "クライアントとサーバープロセスを終了中...",
    close_all_success: "🛑 {count} 個の関連クライアントおよびバックグラウンドプロセスを終了しました！",
    close_all_none: "✅ 実行中のクライアントまたはバックグラウンドプロセスは検出されませんでした。",
    close_all_fail: "プロセスの終了に失敗しました: "
  }
};

const LANG_META = {
  "zh-TW": { flag: "🇹🇼", label: "繁體中文" },
  "zh-CN": { flag: "🇨🇳", label: "简体中文" },
  "en": { flag: "🇺🇸", label: "English" },
  "ja": { flag: "🇯🇵", label: "日本語" }
};

let currentLang = "zh-TW";

function getSavedLang() {
  const saved = localStorage.getItem("aether_language");
  if (saved && I18N[saved]) return saved;

  const nav = (navigator.language || "").toLowerCase();
  if (nav.includes("cn") || nav.includes("hans")) return "zh-CN";
  if (nav.includes("ja")) return "ja";
  if (nav.includes("en")) return "en";
  return "zh-TW";
}

function t(key, vars = {}) {
  const dict = I18N[currentLang] || I18N["zh-TW"];
  let str = dict[key] || I18N["zh-TW"][key] || key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return str;
}

function applyLanguage(lang) {
  if (!I18N[lang]) lang = "zh-TW";
  currentLang = lang;
  localStorage.setItem("aether_language", lang);
  document.documentElement.lang = lang;

  // Update Custom Dropdown trigger label and flag
  const meta = LANG_META[lang] || LANG_META["zh-TW"];
  document.getElementById("dropdown-current-flag").textContent = meta.flag;
  document.getElementById("dropdown-current-label").textContent = meta.label;

  // Update active state in custom dropdown list
  document.querySelectorAll(".dropdown-item").forEach(item => {
    if (item.getAttribute("data-lang") === lang) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Update all DOM elements with data-i18n
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });

  // Update titles
  const btnUp = document.getElementById("btn-port-up");
  const btnDown = document.getElementById("btn-port-down");
  if (btnUp) btnUp.title = t("stepper_up_title");
  if (btnDown) btnDown.title = t("stepper_down_title");

  // Refresh dynamic states if loaded
  if (lastSystemInfo) {
    updateSystemDisplay(lastSystemInfo);
  }
  if (lastUpdateResult) {
    renderUpdateResult(lastUpdateResult);
  }
}

// -------------------------------------------------------------
// Resilient Tauri IPC Resolver
// -------------------------------------------------------------
let _invokeFn = null;

async function getInvokeFn(maxRetries = 60, intervalMs = 50) {
  if (_invokeFn) return _invokeFn;

  for (let i = 0; i < maxRetries; i++) {
    if (window.__TAURI__?.core?.invoke) {
      _invokeFn = window.__TAURI__.core.invoke;
      return _invokeFn;
    }
    if (window.__TAURI__?.invoke) {
      _invokeFn = window.__TAURI__.invoke;
      return _invokeFn;
    }
    if (window.__TAURI_INTERNALS__?.invoke) {
      _invokeFn = window.__TAURI_INTERNALS__.invoke;
      return _invokeFn;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

const invoke = async (cmd, args = {}) => {
  const fn = await getInvokeFn();
  if (fn) {
    return fn(cmd, args);
  }
  throw new Error("Tauri API is not available in standard browser environment.");
};

// -------------------------------------------------------------
// UI State & Elements
// -------------------------------------------------------------
let lastSystemInfo = null;
let lastUpdateResult = null;
let isSystemReady = false;

const launcherContainer = document.getElementById("launcher-container");
const projectPathEl = document.getElementById("project-path-display");
const pythonStatusEl = document.getElementById("python-status-display");
const systemReadyDot = document.getElementById("system-ready-dot");
const systemReadyText = document.getElementById("system-ready-text");
const serverPortInput = document.getElementById("server-port");
const ecoModeToggle = document.getElementById("eco-mode-toggle");

const updateBanner = document.getElementById("update-banner");
const updateIcon = document.getElementById("update-icon");
const updateTitle = document.getElementById("update-title");
const updateDesc = document.getElementById("update-desc");
const updateAction = document.getElementById("update-action");
const footerStatusBar = document.getElementById("footer-status-bar");

const btnLaunchDesktop = document.getElementById("btn-launch-desktop");
const btnLaunchCli = document.getElementById("btn-launch-cli");
const btnLaunchBrowser = document.getElementById("btn-launch-browser");

const btnCreateShortcut = document.getElementById("btn-create-shortcut");
const btnOpenFolder = document.getElementById("btn-open-folder");
const btnReinstallCore = document.getElementById("btn-reinstall-core");
const btnSelfUpdateLauncher = document.getElementById("btn-self-update-launcher");
const btnHealthCheck = document.getElementById("btn-health-check");
const btnCloseAll = document.getElementById("btn-close-all");
const installBanner = document.getElementById("install-banner");
const btnInstallCore = document.getElementById("btn-install-core");
const installBtnText = document.getElementById("install-btn-text");

// -------------------------------------------------------------
// Logic: Custom Dropdown Menu for Language
// -------------------------------------------------------------
const langDropdown = document.getElementById("lang-dropdown");
const langDropdownTrigger = document.getElementById("lang-dropdown-trigger");

langDropdownTrigger.addEventListener("click", (e) => {
  e.stopPropagation();
  langDropdown.classList.toggle("open");
  const isOpen = langDropdown.classList.contains("open");
  langDropdownTrigger.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll(".dropdown-item").forEach(item => {
  item.addEventListener("click", () => {
    const selectedLang = item.getAttribute("data-lang");
    applyLanguage(selectedLang);
    langDropdown.classList.remove("open");
    langDropdownTrigger.setAttribute("aria-expanded", "false");
  });
});

document.addEventListener("click", (e) => {
  if (!langDropdown.contains(e.target)) {
    langDropdown.classList.remove("open");
    langDropdownTrigger.setAttribute("aria-expanded", "false");
  }
});

// -------------------------------------------------------------
// Logic: Custom Stepper (Up/Down) Buttons for Port
// -------------------------------------------------------------
const btnPortUp = document.getElementById("btn-port-up");
const btnPortDown = document.getElementById("btn-port-down");

function adjustPort(delta) {
  let val = parseInt(serverPortInput.value, 10) || 8000;
  val = Math.max(1024, Math.min(65535, val + delta));
  serverPortInput.value = val;
}

btnPortUp.addEventListener("click", () => adjustPort(1));
btnPortDown.addEventListener("click", () => adjustPort(-1));

function setupStepperHolding(btn, delta) {
  let timer = null;
  let interval = null;

  const start = () => {
    adjustPort(delta);
    timer = setTimeout(() => {
      interval = setInterval(() => adjustPort(delta), 80);
    }, 350);
  };

  const stop = () => {
    clearTimeout(timer);
    clearInterval(interval);
  };

  btn.addEventListener("mousedown", start);
  btn.addEventListener("mouseup", stop);
  btn.addEventListener("mouseleave", stop);
}

setupStepperHolding(btnPortUp, 1);
setupStepperHolding(btnPortDown, -1);

// -------------------------------------------------------------
// Logic: One-Click Core Installation & Dependency Setup
// -------------------------------------------------------------
if (btnInstallCore) {
  btnInstallCore.addEventListener("click", async () => {
    btnInstallCore.disabled = true;
    if (installBtnText) installBtnText.textContent = t("btn_installing");
    footerStatusBar.textContent = t("btn_installing");
    footerStatusBar.style.color = "#00f2fe";

    try {
      const msg = await invoke("install_or_repair_core");
      footerStatusBar.textContent = t("install_success");
      footerStatusBar.style.color = "#10b981";
      alert(msg || t("install_success"));
      await loadSystemInfo();
      await doCheckUpdate();
    } catch (err) {
      alert(t("install_failed") + err);
      footerStatusBar.textContent = t("install_failed") + err;
      footerStatusBar.style.color = "#f43f5e";
    } finally {
      btnInstallCore.disabled = false;
      if (installBtnText) installBtnText.textContent = t("btn_install_now");
    }
  });
}

// -------------------------------------------------------------
// Logic: Hardware-Saving Low-Resource Mode
// -------------------------------------------------------------
function setEcoMode(enabled) {
  if (enabled) {
    launcherContainer.classList.add("eco-mode");
  } else {
    launcherContainer.classList.remove("eco-mode");
  }
  localStorage.setItem("aether_eco_mode", enabled ? "1" : "0");
}

ecoModeToggle.addEventListener("change", (e) => {
  setEcoMode(e.target.checked);
});

// -------------------------------------------------------------
// Logic: System Info
// -------------------------------------------------------------
function updateSystemDisplay(info) {
  if (info.is_installed) {
    if (installBanner) installBanner.style.display = "none";
    projectPathEl.textContent = info.project_path;
    projectPathEl.title = info.project_path;
    projectPathEl.style.color = "#f8fafc";
  } else {
    if (installBanner) installBanner.style.display = "block";
    projectPathEl.textContent = t("env_project_not_found");
    projectPathEl.style.color = "#f43f5e";
  }

  if (info.python_path) {
    pythonStatusEl.textContent = t("env_python_ready");
    pythonStatusEl.title = info.python_path;
    pythonStatusEl.style.color = "#10b981";
  } else {
    pythonStatusEl.textContent = t("env_python_not_found");
    pythonStatusEl.style.color = "#f43f5e";
  }

  isSystemReady = info.is_ready;
  if (isSystemReady) {
    systemReadyDot.className = "dot green";
    systemReadyText.textContent = t("env_core_ready");
    systemReadyText.style.color = "#10b981";
  } else {
    systemReadyDot.className = "dot red";
    systemReadyText.textContent = t("env_core_missing");
    systemReadyText.style.color = "#f43f5e";
  }

  if (info.current_version && footerStatusBar) {
    footerStatusBar.textContent = t("footer_status_standby", { version: info.current_version });
  }
}

async function loadSystemInfo() {
  try {
    const info = await invoke("get_system_info");
    lastSystemInfo = info;
    updateSystemDisplay(info);
  } catch (err) {
    console.error("Failed to load system info:", err);
    projectPathEl.textContent = t("env_project_not_found");
  }
}

// -------------------------------------------------------------
// Logic: Launcher Self-Update
// -------------------------------------------------------------
async function doSelfUpdateLauncher(url = null) {
  const originalText = btnSelfUpdateLauncher.innerHTML;
  btnSelfUpdateLauncher.disabled = true;
  btnSelfUpdateLauncher.innerHTML = `<span>⏳ ${t("btn_updating_launcher")}</span>`;
  footerStatusBar.textContent = t("btn_updating_launcher");
  footerStatusBar.style.color = "#f59e0b";

  try {
    const msg = await invoke("self_update_launcher", { downloadUrl: url });
    footerStatusBar.textContent = msg || t("launcher_update_success");
    footerStatusBar.style.color = "#10b981";
  } catch (err) {
    alert(t("launcher_update_fail") + err);
    footerStatusBar.textContent = t("launcher_update_fail") + err;
    footerStatusBar.style.color = "#f43f5e";
    btnSelfUpdateLauncher.disabled = false;
    btnSelfUpdateLauncher.innerHTML = originalText;
  }
}

btnSelfUpdateLauncher.addEventListener("click", () => {
  doSelfUpdateLauncher(lastUpdateResult?.launcher_download_url || null);
});

// -------------------------------------------------------------
// Logic: Update Check & Apply
// -------------------------------------------------------------
function renderUpdateResult(res) {
  updateAction.innerHTML = "";

  if (res && res.has_update) {
    updateBanner.className = "update-banner state-update-available";
    updateIcon.textContent = "🎉";
    updateTitle.textContent = t("update_available_title", { version: res.latest_version });
    updateDesc.textContent = res.release_name || res.published_at || "";

    // 1. One-Click Full Update (Project + Launcher) Button
    const btnUpdateProject = document.createElement("button");
    btnUpdateProject.className = "btn-update-now";
    btnUpdateProject.textContent = res.launcher_download_url ? t("btn_update_full") : t("btn_update_now");
    btnUpdateProject.onclick = async () => {
      btnUpdateProject.disabled = true;
      btnUpdateProject.textContent = t("btn_updating");
      try {
        const pullMsg = await invoke("apply_update");
        // CRITICAL FIX: Reset has_update state so switching language never pops up update alert again!
        res.has_update = false;
        lastUpdateResult = {
          ...res,
          has_update: false,
          current_version: res.latest_version || res.current_version
        };
        if (res.launcher_download_url) {
          btnUpdateProject.textContent = t("btn_updating_launcher");
          await invoke("self_update_launcher", { downloadUrl: res.launcher_download_url });
          return;
        }
        updateBanner.className = "update-banner state-latest";
        updateIcon.textContent = "✅";
        updateTitle.textContent = t("update_success_title");
        updateDesc.textContent = pullMsg;
        btnUpdateProject.remove();
        await loadSystemInfo();
      } catch (e) {
        alert(t("update_failed") + e);
        btnUpdateProject.disabled = false;
        btnUpdateProject.textContent = res.launcher_download_url ? t("btn_update_full") : t("btn_update_now");
      }
    };
    updateAction.appendChild(btnUpdateProject);

    // 2. Optional standalone Launcher Binary Update Button if user specifically wants launcher-only
    if (res.launcher_download_url) {
      const btnUpdateLauncher = document.createElement("button");
      btnUpdateLauncher.className = "btn-ghost";
      btnUpdateLauncher.style.borderColor = "#00f2fe";
      btnUpdateLauncher.style.color = "#00f2fe";
      btnUpdateLauncher.textContent = t("btn_update_launcher");
      btnUpdateLauncher.onclick = () => doSelfUpdateLauncher(res.launcher_download_url);
      updateAction.appendChild(btnUpdateLauncher);
    }
  } else {
    updateBanner.className = "update-banner state-latest";
    updateIcon.textContent = "✅";
    const curVer = res?.current_version || "4.0.0";
    updateTitle.textContent = t("update_latest_title", { version: curVer });
    updateDesc.textContent = t("update_latest_desc");

    const btnRecheck = document.createElement("button");
    btnRecheck.className = "btn-ghost";
    btnRecheck.textContent = t("btn_recheck");
    btnRecheck.onclick = doCheckUpdate;
    updateAction.appendChild(btnRecheck);
  }
}

async function doCheckUpdate() {
  updateBanner.className = "update-banner state-checking";
  updateIcon.textContent = "⏳";
  updateTitle.textContent = t("update_checking_title");
  updateDesc.textContent = t("update_checking_desc");
  updateAction.innerHTML = "";

  try {
    const res = await invoke("check_update");
    lastUpdateResult = res;
    renderUpdateResult(res);
  } catch (err) {
    console.error("Check update failed:", err);
    updateBanner.className = "update-banner state-error";
    updateIcon.textContent = "⚠️";
    updateTitle.textContent = t("update_error_title");
    updateDesc.textContent = String(err);

    const btnRetry = document.createElement("button");
    btnRetry.className = "btn-ghost";
    btnRetry.textContent = t("btn_retry");
    btnRetry.onclick = doCheckUpdate;
    updateAction.appendChild(btnRetry);
  }
}

// -------------------------------------------------------------
// Logic: Launch Modes
// -------------------------------------------------------------
let isLaunching = false;
async function launch(mode, btn) {
  if (isLaunching) return;
  isLaunching = true;
  const originalText = btn.innerHTML;

  if (!lastSystemInfo || !lastSystemInfo.is_installed) {
    const doInstall = confirm(t("confirm_install"));
    if (doInstall && btnInstallCore) {
      btnInstallCore.click();
    }
    isLaunching = false;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span>${t("btn_launching")}</span> <span class="arrow">⏳</span>`;

  const port = parseInt(serverPortInput.value, 10) || 8000;
  const lowSpec = ecoModeToggle.checked;
  
  if (mode === "desktop") {
    footerStatusBar.textContent = t("desktop_launching");
  } else if (mode === "cli") {
    footerStatusBar.textContent = t("cli_launching");
  } else {
    footerStatusBar.textContent = t("browser_launching");
  }

  try {
    const msg = await invoke("launch_mode", { mode, port, lowSpec });
    footerStatusBar.textContent = msg;
    footerStatusBar.style.color = "#00f2fe";
    const match = msg.match(/(?:切換至連接埠|切換至埠號|Port)\s*(\d+)/i);
    if (match && match[1]) {
      serverPortInput.value = match[1];
    }
  } catch (err) {
    alert(t("launch_error") + err);
    footerStatusBar.textContent = t("launch_error") + err;
    footerStatusBar.style.color = "#f43f5e";
  } finally {
    setTimeout(() => {
      isLaunching = false;
      btn.disabled = false;
      btn.innerHTML = originalText;
    }, 2000);
  }
}

// -------------------------------------------------------------
// Event Listeners
// -------------------------------------------------------------
btnLaunchDesktop.addEventListener("click", () => launch("desktop", btnLaunchDesktop));
btnLaunchCli.addEventListener("click", () => launch("cli", btnLaunchCli));
btnLaunchBrowser.addEventListener("click", () => launch("browser", btnLaunchBrowser));

btnCreateShortcut.addEventListener("click", async () => {
  try {
    const msg = await invoke("create_desktop_shortcut");
    alert(msg || t("shortcut_success"));
  } catch (err) {
    alert(t("shortcut_fail") + err);
  }
});

if (btnReinstallCore) {
  btnReinstallCore.addEventListener("click", () => {
    if (confirm(t("confirm_reinstall"))) {
      if (btnInstallCore) {
        btnInstallCore.click();
      }
    }
  });
}

btnOpenFolder.addEventListener("click", async () => {
  try {
    await invoke("open_project_folder");
  } catch (err) {
    alert(t("open_folder_fail") + err);
  }
});

btnHealthCheck.addEventListener("click", async () => {
  try {
    await invoke("run_health_check");
  } catch (err) {
    alert(t("health_check_fail") + err);
  }
});

if (btnCloseAll) {
  btnCloseAll.addEventListener("click", async () => {
    const originalText = btnCloseAll.innerHTML;
    btnCloseAll.disabled = true;
    btnCloseAll.innerHTML = `<span class="close-all-icon">⏳</span> <span>${t("btn_closing_clients")}</span>`;
    footerStatusBar.textContent = t("btn_closing_clients");

    const port = parseInt(serverPortInput.value, 10) || 8000;

    try {
      const count = await invoke("close_all_instances", { port });
      if (count > 0) {
        const msg = t("close_all_success", { count });
        alert(msg);
        footerStatusBar.textContent = msg;
        footerStatusBar.style.color = "#fda4af";
      } else {
        const msg = t("close_all_none");
        alert(msg);
        footerStatusBar.textContent = msg;
        footerStatusBar.style.color = "#34d399";
      }
      loadSystemInfo();
    } catch (err) {
      alert(t("close_all_fail") + err);
      footerStatusBar.textContent = t("close_all_fail") + err;
      footerStatusBar.style.color = "#f43f5e";
    } finally {
      btnCloseAll.disabled = false;
      btnCloseAll.innerHTML = originalText;
    }
  });
}

// Auto-run on startup
window.addEventListener("DOMContentLoaded", async () => {
  // Load Language Preference
  const initialLang = getSavedLang();
  applyLanguage(initialLang);

  // Load Eco Mode Preference
  const savedEco = localStorage.getItem("aether_eco_mode") === "1";
  ecoModeToggle.checked = savedEco;
  setEcoMode(savedEco);

  // Poll for Tauri IPC readiness before invoking
  await getInvokeFn();

  loadSystemInfo();
  doCheckUpdate();
});
