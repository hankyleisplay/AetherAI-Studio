// Aether AI Studio 3.5 - Tauri Launcher Frontend Logic

const invoke = async (cmd, args = {}) => {
  if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    return window.__TAURI__.core.invoke(cmd, args);
  }
  if (window.__TAURI__ && window.__TAURI__.invoke) {
    return window.__TAURI__.invoke(cmd, args);
  }
  throw new Error("Tauri API is not available in standard browser environment.");
};

// DOM Elements
const projectPathEl = document.getElementById("project-path-display");
const pythonStatusEl = document.getElementById("python-status-display");
const systemReadyDot = document.getElementById("system-ready-dot");
const systemReadyText = document.getElementById("system-ready-text");
const serverPortInput = document.getElementById("server-port");

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
const btnHealthCheck = document.getElementById("btn-health-check");

let isSystemReady = false;

// 1. Initialize System Info
async function loadSystemInfo() {
  try {
    const info = await invoke("get_system_info");
    
    if (info.project_path) {
      projectPathEl.textContent = info.project_path;
      projectPathEl.title = info.project_path;
    } else {
      projectPathEl.textContent = "未找到專案目錄！";
      projectPathEl.style.color = "#f43f5e";
    }

    if (info.python_path) {
      pythonStatusEl.textContent = "已就緒 (Python 3)";
      pythonStatusEl.title = info.python_path;
      pythonStatusEl.style.color = "#10b981";
    } else {
      pythonStatusEl.textContent = "未偵測到 Python！";
      pythonStatusEl.style.color = "#f43f5e";
    }

    isSystemReady = info.is_ready;
    if (isSystemReady) {
      systemReadyDot.className = "dot green";
      systemReadyText.textContent = "核心環境就緒";
      systemReadyText.style.color = "#10b981";
    } else {
      systemReadyDot.className = "dot red";
      systemReadyText.textContent = "環境缺失";
      systemReadyText.style.color = "#f43f5e";
    }
  } catch (err) {
    console.error("Failed to load system info:", err);
    projectPathEl.textContent = "偵測失敗";
  }
}

// 2. Automatic Update Check
async function doCheckUpdate() {
  updateBanner.className = "update-banner state-checking";
  updateIcon.textContent = "⏳";
  updateTitle.textContent = "自動檢查更新中...";
  updateDesc.textContent = "正在向官方 GitHub 驗證最新發行版本與倉庫狀態";
  updateAction.innerHTML = "";

  try {
    const res = await invoke("check_update");

    if (res.has_update) {
      updateBanner.className = "update-banner state-update-available";
      updateIcon.textContent = "🎉";
      updateTitle.textContent = `發現新版本 v${res.latest_version}！`;
      updateDesc.textContent = res.release_name || "有最新的功能更新可供拉取";

      const btnUpdate = document.createElement("button");
      btnUpdate.className = "btn-update-now";
      btnUpdate.textContent = "⚡ 立即更新";
      btnUpdate.onclick = async () => {
        btnUpdate.disabled = true;
        btnUpdate.textContent = "正在更新中...";
        try {
          const pullMsg = await invoke("apply_update");
          updateBanner.className = "update-banner state-latest";
          updateIcon.textContent = "✅";
          updateTitle.textContent = "已成功更新至最新版！";
          updateDesc.textContent = pullMsg;
          btnUpdate.remove();
        } catch (e) {
          alert(`更新失敗: ${e}`);
          btnUpdate.disabled = false;
          btnUpdate.textContent = "⚡ 重試更新";
        }
      };

      updateAction.appendChild(btnUpdate);
    } else {
      updateBanner.className = "update-banner state-latest";
      updateIcon.textContent = "✅";
      updateTitle.textContent = `已是最新正式版 v${res.current_version}`;
      updateDesc.textContent = "GitHub 遠端發行與本地版本一致，無需更新";

      const btnRecheck = document.createElement("button");
      btnRecheck.className = "btn-ghost";
      btnRecheck.textContent = "🔄 重新檢查";
      btnRecheck.onclick = doCheckUpdate;
      updateAction.appendChild(btnRecheck);
    }
  } catch (err) {
    updateBanner.className = "update-banner state-error";
    updateIcon.textContent = "⚠️";
    updateTitle.textContent = "離線或更新檢查略過";
    updateDesc.textContent = String(err);

    const btnRetry = document.createElement("button");
    btnRetry.className = "btn-ghost";
    btnRetry.textContent = "重試";
    btnRetry.onclick = doCheckUpdate;
    updateAction.appendChild(btnRetry);
  }
}

// 3. Launch Handlers
async function launch(mode, btn) {
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span>啟動中...</span> <span class="arrow">⏳</span>`;

  const port = parseInt(serverPortInput.value, 10) || 8000;
  footerStatusBar.textContent = `正在啟動 [${mode.toUpperCase()}] 模式 (Port: ${port})...`;

  try {
    const msg = await invoke("launch_mode", { mode, port });
    footerStatusBar.textContent = msg;
    footerStatusBar.style.color = "#00f2fe";
  } catch (err) {
    alert(`啟動失敗: ${err}`);
    footerStatusBar.textContent = `啟動出錯: ${err}`;
    footerStatusBar.style.color = "#f43f5e";
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }, 2500);
  }
}

// Event Listeners
btnLaunchDesktop.addEventListener("click", () => launch("desktop", btnLaunchDesktop));
btnLaunchCli.addEventListener("click", () => launch("cli", btnLaunchCli));
btnLaunchBrowser.addEventListener("click", () => launch("browser", btnLaunchBrowser));

btnCreateShortcut.addEventListener("click", async () => {
  try {
    const msg = await invoke("create_desktop_shortcut");
    alert(msg);
  } catch (err) {
    alert(`建立捷徑失敗: ${err}`);
  }
});

btnOpenFolder.addEventListener("click", async () => {
  try {
    await invoke("open_project_folder");
  } catch (err) {
    alert(`開啟目錄失敗: ${err}`);
  }
});

btnHealthCheck.addEventListener("click", async () => {
  try {
    await invoke("run_health_check");
  } catch (err) {
    alert(`啟動診斷失敗: ${err}`);
  }
});

// Auto-run on startup
window.addEventListener("DOMContentLoaded", () => {
  loadSystemInfo();
  doCheckUpdate();
});
