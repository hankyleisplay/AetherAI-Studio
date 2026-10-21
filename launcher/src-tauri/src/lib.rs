use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CURRENT_VERSION: &str = "3.5.0";
const CREATE_NO_WINDOW: u32 = 0x08000000;
const CREATE_NEW_CONSOLE: u32 = 0x00000010;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemInfo {
    pub project_path: Option<String>,
    pub python_path: Option<String>,
    pub git_available: bool,
    pub current_version: String,
    pub is_ready: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UpdateResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: String,
    pub release_name: String,
    pub release_notes: String,
    pub published_at: String,
    pub html_url: String,
    pub error: Option<String>,
}

fn find_project_root() -> Option<PathBuf> {
    // 1. Current working directory
    if let Ok(cwd) = env::current_dir() {
        if cwd.join("start.py").exists() {
            return Some(cwd);
        }
        if let Some(parent) = cwd.parent() {
            if parent.join("start.py").exists() {
                return Some(parent.to_path_buf());
            }
        }
    }

    // 2. Executable's directory
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if exe_dir.join("start.py").exists() {
                return Some(exe_dir.to_path_buf());
            }
            if let Some(parent) = exe_dir.parent() {
                if parent.join("start.py").exists() {
                    return Some(parent.to_path_buf());
                }
            }
        }
    }

    // 3. Known project paths
    let home = env::var("USERPROFILE").unwrap_or_default();
    let candidates = [
        r"C:\Users\李秉翰\Documents\Project\AetherAI-Studio",
        r"C:\Users\李秉翰\AetherAI-Studio",
        &format!(r"{}\Documents\Project\AetherAI-Studio", home),
        &format!(r"{}\AetherAI-Studio", home),
        &format!(r"{}\Desktop\AetherAI-Studio", home),
        &format!(r"{}\Downloads\AetherAI-Studio", home),
        r"D:\AetherAI-Studio",
        r"E:\AetherAI-Studio",
    ];

    for candidate in &candidates {
        let p = Path::new(candidate);
        if p.join("start.py").exists() {
            return Some(p.to_path_buf());
        }
    }

    None
}

fn find_python() -> Option<String> {
    // 1. Test if "python" in PATH is directly callable
    let mut check_py = Command::new("python");
    check_py.arg("--version");
    #[cfg(windows)]
    check_py.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = check_py.output() {
        if output.status.success() {
            return Some("python".to_string());
        }
    }

    // 2. Test if "py" launcher is directly callable
    let mut check_py_launcher = Command::new("py");
    check_py_launcher.args(["-3", "--version"]);
    #[cfg(windows)]
    check_py_launcher.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = check_py_launcher.output() {
        if output.status.success() {
            return Some("py -3".to_string());
        }
    }

    // 3. Fallback to common Windows Python installation paths
    let home = env::var("USERPROFILE").unwrap_or_default();
    let common_paths = [
        format!(r"{}\AppData\Local\Programs\Python\Python314\python.exe", home),
        format!(r"{}\AppData\Local\Programs\Python\Python313\python.exe", home),
        format!(r"{}\AppData\Local\Programs\Python\Python312\python.exe", home),
        format!(r"{}\AppData\Local\Programs\Python\Python311\python.exe", home),
        r"C:\Users\李秉翰\AppData\Local\Programs\Python\Python314\python.exe".to_string(),
        r"C:\Python314\python.exe".to_string(),
        r"C:\Python313\python.exe".to_string(),
        r"C:\Python312\python.exe".to_string(),
        r"C:\Python311\python.exe".to_string(),
    ];

    for path in &common_paths {
        if Path::new(path).exists() {
            return Some(path.clone());
        }
    }

    None
}

fn check_git() -> bool {
    let mut cmd = Command::new("git");
    cmd.arg("--version");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let project_dir = find_project_root();
    let python_exe = find_python();
    let git = check_git();

    let is_ready = project_dir.is_some() && python_exe.is_some();

    SystemInfo {
        project_path: project_dir.map(|p| p.to_string_lossy().to_string()),
        python_path: python_exe,
        git_available: git,
        current_version: CURRENT_VERSION.to_string(),
        is_ready,
    }
}

#[tauri::command]
fn check_update() -> UpdateResult {
    let mut result = UpdateResult {
        has_update: false,
        current_version: CURRENT_VERSION.to_string(),
        latest_version: CURRENT_VERSION.to_string(),
        release_name: "Aether AI Studio 3.5 (Official Release)".to_string(),
        release_notes: "".to_string(),
        published_at: "".to_string(),
        html_url: "https://github.com/hankyleisplay/AetherAI-Studio/releases".to_string(),
        error: None,
    };

    // 1. Query GitHub Releases API
    let api_url = "https://api.github.com/repos/hankyleisplay/AetherAI-Studio/releases/latest";
    let resp = ureq::get(api_url)
        .set("User-Agent", "AetherLauncher-v3.5")
        .set("Accept", "application/vnd.github.v3+json")
        .timeout(std::time::Duration::from_secs(6))
        .call();

    match resp {
        Ok(response) => {
            if let Ok(json) = response.into_json::<serde_json::Value>() {
                if let Some(tag) = json.get("tag_name").and_then(|v| v.as_str()) {
                    let clean_tag = tag.trim_start_matches('v').trim();
                    result.latest_version = clean_tag.to_string();

                    if let Some(name) = json.get("name").and_then(|v| v.as_str()) {
                        result.release_name = name.to_string();
                    }
                    if let Some(body) = json.get("body").and_then(|v| v.as_str()) {
                        result.release_notes = body.to_string();
                    }
                    if let Some(date) = json.get("published_at").and_then(|v| v.as_str()) {
                        result.published_at = date.to_string();
                    }
                    if let Some(url) = json.get("html_url").and_then(|v| v.as_str()) {
                        result.html_url = url.to_string();
                    }

                    if clean_tag != CURRENT_VERSION && clean_tag > CURRENT_VERSION {
                        result.has_update = true;
                        return result;
                    }
                }
            }
        }
        Err(e) => {
            result.error = Some(format!("GitHub API 查詢失敗: {}", e));
        }
    }

    // 2. Local Git repository check
    if let Some(project_path) = find_project_root() {
        let git_dir = project_path.join(".git");
        if git_dir.exists() {
            let mut fetch_cmd = Command::new("git");
            fetch_cmd.args(["fetch", "origin"])
                .current_dir(&project_path);
            #[cfg(windows)]
            fetch_cmd.creation_flags(CREATE_NO_WINDOW);

            if let Ok(fetch_out) = fetch_cmd.output() {
                if fetch_out.status.success() {
                    let mut local_cmd = Command::new("git");
                    local_cmd.args(["rev-parse", "HEAD"]).current_dir(&project_path);
                    #[cfg(windows)]
                    local_cmd.creation_flags(CREATE_NO_WINDOW);

                    let mut remote_cmd = Command::new("git");
                    remote_cmd.args(["rev-parse", "@{u}"]).current_dir(&project_path);
                    #[cfg(windows)]
                    remote_cmd.creation_flags(CREATE_NO_WINDOW);

                    let local_hash = local_cmd.output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
                    let remote_hash = remote_cmd.output().ok().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();

                    if !local_hash.is_empty() && !remote_hash.is_empty() && local_hash != remote_hash {
                        result.has_update = true;
                        result.release_name = "檢測到遠端倉庫有最新程式碼更新".to_string();
                    }
                }
            }
        }
    }

    result
}

#[tauri::command]
fn apply_update() -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => return Err("找不到專案目錄，無法執行 git pull 更新。".to_string()),
    };

    let mut pull_cmd = Command::new("git");
    pull_cmd.args(["pull"]).current_dir(&project_dir);
    #[cfg(windows)]
    pull_cmd.creation_flags(CREATE_NO_WINDOW);

    match pull_cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok("✅ 已成功拉取最新更新至本地！".to_string())
            } else {
                let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
                Err(format!("Git pull 失敗: {}", err_msg))
            }
        }
        Err(e) => Err(format!("執行 git 失敗: {}", e)),
    }
}

#[tauri::command]
fn launch_mode(mode: String, port: u16) -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => return Err("找不到 Aether AI Studio 專案目錄 (start.py)。請確認專案已放置於正確位置。".to_string()),
    };

    let python_bin = match find_python() {
        Some(p) => p,
        None => return Err("找不到系統 Python。請確認已安裝 Python 3.10+ 並加入系統 PATH。".to_string()),
    };

    let start_py = project_dir.join("start.py");
    if !start_py.exists() {
        return Err(format!("主程式檔案不存在: {}", start_py.display()));
    }

    let port_str = port.to_string();

    match mode.as_str() {
        "desktop" => {
            // Standalone desktop mode: Launch python with --desktop directly in background
            let mut cmd = if python_bin == "py -3" {
                let mut c = Command::new("py");
                c.arg("-3");
                c
            } else {
                Command::new(&python_bin)
            };

            cmd.args([
                start_py.to_string_lossy().as_ref(),
                "--port",
                &port_str,
                "--desktop",
            ])
            .current_dir(&project_dir);

            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);

            match cmd.spawn() {
                Ok(_) => Ok("✅ 原生獨立桌面版正在啟動中，請稍候...".to_string()),
                Err(e) => Err(format!("桌面模式啟動失敗: {}", e)),
            }
        }
        "cli" => {
            // Terminal CLI mode: Spawn cmd.exe with CREATE_NEW_CONSOLE running start.py
            let exec_cmd = format!(
                "chcp 65001 >nul & title Aether AI Studio 3.5 [CLI 伺服器] & {} start.py --port {} --no-browser",
                python_bin,
                port_str
            );

            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/k", &exec_cmd])
                .current_dir(&project_dir);

            #[cfg(windows)]
            cmd.creation_flags(CREATE_NEW_CONSOLE);

            match cmd.spawn() {
                Ok(_) => Ok("✅ 已在專屬終端視窗中啟動 CLI 伺服器！".to_string()),
                Err(e) => Err(format!("終端啟動失敗: {}", e)),
            }
        }
        "browser" => {
            // Browser mode: Spawn cmd.exe with CREATE_NEW_CONSOLE running start.py
            let exec_cmd = format!(
                "chcp 65001 >nul & title Aether AI Studio 3.5 & {} start.py --port {}",
                python_bin,
                port_str
            );

            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/k", &exec_cmd])
                .current_dir(&project_dir);

            #[cfg(windows)]
            cmd.creation_flags(CREATE_NEW_CONSOLE);

            match cmd.spawn() {
                Ok(_) => Ok("✅ 伺服器已啟動，即將為您開啟瀏覽器...".to_string()),
                Err(e) => Err(format!("瀏覽器模式啟動失敗: {}", e)),
            }
        }
        _ => Err("未知的啟動模式".to_string()),
    }
}

#[tauri::command]
fn create_desktop_shortcut() -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => return Err("找不到專案目錄。".to_string()),
    };

    let launcher_exe = if let Ok(exe) = env::current_exe() {
        exe.to_string_lossy().to_string()
    } else {
        project_dir.join("AetherLauncher.exe").to_string_lossy().to_string()
    };

    let ps_script = format!(
        r#"$desktop = [Environment]::GetFolderPath('Desktop');
$s = (New-Object -COM WScript.Shell).CreateShortcut("$desktop\Aether AI Studio 3.5.lnk");
$s.TargetPath = '{}';
$s.WorkingDirectory = '{}';
$s.Description = 'Aether AI Studio 3.5 官方專屬啟動器';
$s.Save();"#,
        launcher_exe.replace('\\', "\\\\"),
        project_dir.to_string_lossy().replace('\\', "\\\\")
    );

    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", &ps_script]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok("⭐ 成功在您的 Windows 桌面建立「Aether AI Studio 3.5」捷徑！".to_string())
            } else {
                Err(format!("建立捷徑失敗: {}", String::from_utf8_lossy(&output.stderr)))
            }
        }
        Err(e) => Err(format!("PowerShell 執行失敗: {}", e)),
    }
}

#[tauri::command]
fn open_project_folder() -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => return Err("找不到專案目錄。".to_string()),
    };

    let dir_str = project_dir.to_string_lossy().to_string();

    let mut cmd = Command::new("cmd.exe");
    cmd.args(["/c", "start", "", &dir_str]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.spawn() {
        Ok(_) => Ok("已開啟目錄".to_string()),
        Err(e) => Err(format!("開啟目錄失敗: {}", e)),
    }
}

#[tauri::command]
fn run_health_check() -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => return Err("找不到專案目錄。".to_string()),
    };

    let python_bin = match find_python() {
        Some(p) => p,
        None => return Err("找不到 Python。".to_string()),
    };

    let exec_cmd = format!(
        "chcp 65001 >nul & title Aether AI Studio 3.5 [系統檢測] & {} test_backend.py & pause",
        python_bin
    );

    let mut cmd = Command::new("cmd.exe");
    cmd.args(["/k", &exec_cmd])
        .current_dir(&project_dir);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NEW_CONSOLE);

    match cmd.spawn() {
        Ok(_) => Ok("已開啟健康診斷測試視窗！".to_string()),
        Err(e) => Err(format!("啟動診斷失敗: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            check_update,
            apply_update,
            launch_mode,
            create_desktop_shortcut,
            open_project_folder,
            run_health_check
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
