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
    pub launcher_download_url: Option<String>,
    pub error: Option<String>,
}

fn cleanup_old_launcher() {
    if let Ok(exe_path) = env::current_exe() {
        let backup_exe = exe_path.with_extension("exe.bak");
        if backup_exe.exists() {
            let _ = std::fs::remove_file(backup_exe);
        }
        let temp_exe = exe_path.with_extension("exe.new");
        if temp_exe.exists() {
            let _ = std::fs::remove_file(temp_exe);
        }
    }
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
        launcher_download_url: None,
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

                    if let Some(assets) = json.get("assets").and_then(|a| a.as_array()) {
                        for asset in assets {
                            if let Some(name) = asset.get("name").and_then(|n| n.as_str()) {
                                if name == "AetherLauncher.exe" {
                                    if let Some(url) = asset.get("browser_download_url").and_then(|u| u.as_str()) {
                                        result.launcher_download_url = Some(url.to_string());
                                        break;
                                    }
                                }
                            }
                        }
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

fn get_latest_launcher_url() -> Result<String, String> {
    let api_url = "https://api.github.com/repos/hankyleisplay/AetherAI-Studio/releases/latest";
    let resp = ureq::get(api_url)
        .set("User-Agent", "AetherLauncher-v3.5")
        .set("Accept", "application/vnd.github.v3+json")
        .timeout(std::time::Duration::from_secs(8))
        .call()
        .map_err(|e| format!("GitHub API 連線失敗: {}", e))?;

    let json: serde_json::Value = resp.into_json().map_err(|e| format!("解析回應失敗: {}", e))?;
    if let Some(assets) = json.get("assets").and_then(|a| a.as_array()) {
        for asset in assets {
            if let Some(name) = asset.get("name").and_then(|n| n.as_str()) {
                if name == "AetherLauncher.exe" {
                    if let Some(url) = asset.get("browser_download_url").and_then(|u| u.as_str()) {
                        return Ok(url.to_string());
                    }
                }
            }
        }
    }
    Err("在最新 GitHub Release 中未找到 AetherLauncher.exe 發行資產。".to_string())
}

#[tauri::command]
fn self_update_launcher(download_url: Option<String>) -> Result<String, String> {
    let current_exe = match env::current_exe() {
        Ok(p) => p,
        Err(e) => return Err(format!("無法獲取當前執行檔路徑: {}", e)),
    };

    let target_url = if let Some(url) = download_url {
        if !url.trim().is_empty() {
            url
        } else {
            get_latest_launcher_url()?
        }
    } else {
        get_latest_launcher_url()?
    };

    // 1. Download to temporary file
    let temp_exe = current_exe.with_extension("exe.new");
    if temp_exe.exists() {
        let _ = std::fs::remove_file(&temp_exe);
    }

    let resp = ureq::get(&target_url)
        .set("User-Agent", "AetherLauncher-Updater")
        .timeout(std::time::Duration::from_secs(60))
        .call()
        .map_err(|e| format!("下載最新啟動器失敗: {}", e))?;

    let mut reader = resp.into_reader();
    let mut out_file = std::fs::File::create(&temp_exe)
        .map_err(|e| format!("建立臨時檔案失敗: {}", e))?;
    std::io::copy(&mut reader, &mut out_file)
        .map_err(|e| format!("寫入檔案失敗: {}", e))?;
    drop(out_file);

    // Verify file size
    let metadata = std::fs::metadata(&temp_exe).map_err(|e| format!("讀取檔案資訊失敗: {}", e))?;
    if metadata.len() < 1_000_000 {
        let _ = std::fs::remove_file(&temp_exe);
        return Err("下載之檔案大小異常，已取消更新。".to_string());
    }

    // 2. Rename current running exe to .bak
    let backup_exe = current_exe.with_extension("exe.bak");
    if backup_exe.exists() {
        let _ = std::fs::remove_file(&backup_exe);
    }
    std::fs::rename(&current_exe, &backup_exe)
        .map_err(|e| format!("備份現有啟動器失敗 (可能被鎖定): {}", e))?;

    // 3. Move new exe to original path
    if let Err(e) = std::fs::rename(&temp_exe, &current_exe) {
        let _ = std::fs::rename(&backup_exe, &current_exe);
        return Err(format!("替換新版啟動器失敗: {}", e));
    }

    // 4. Spawn the new exe
    let mut cmd = Command::new(&current_exe);
    if let Some(parent) = current_exe.parent() {
        cmd.current_dir(parent);
    }
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd.spawn().map_err(|e| format!("重新啟動新版啟動器失敗: {}", e))?;

    // 5. Exit the current process after short delay
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(500));
        std::process::exit(0);
    });

    Ok("✅ 啟動器已成功更新至最新版，正在為您自動重新啟動...".to_string())
}

#[tauri::command]
fn close_all_instances(port: u16) -> Result<u32, String> {
    let port_str = port.to_string();

    let ps_script = format!(
        r#"$killed = 0;
$pids = @();
$conns = Get-NetTCPConnection -LocalPort {} -ErrorAction SilentlyContinue;
if ($conns) {{ $pids += ($conns | Select-Object -ExpandProperty OwningProcess) }}
$app_procs = Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%aetherai_studio_3%' OR CommandLine LIKE '%start.py%' OR CommandLine LIKE '%test_backend.py%'" -ErrorAction SilentlyContinue;
if ($app_procs) {{ $pids += ($app_procs | Select-Object -ExpandProperty ProcessId) }}
$unique_pids = $pids | Select-Object -Unique | Where-Object {{ $_ -gt 0 -and $_ -ne $PID }};
foreach ($p in $unique_pids) {{
    try {{
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue;
        $killed++;
    }} catch {{}}
}}
Write-Host $killed;"#,
        port_str
    );

    // Also close CMD windows with title starting with Aether AI Studio
    let mut cmd_kill = Command::new("taskkill");
    cmd_kill.args(["/F", "/FI", "WINDOWTITLE eq Aether AI Studio*", "/T"]);
    #[cfg(windows)]
    cmd_kill.creation_flags(CREATE_NO_WINDOW);
    let _ = cmd_kill.output();

    let mut ps_cmd = Command::new("powershell");
    ps_cmd.args(["-NoProfile", "-Command", &ps_script]);
    #[cfg(windows)]
    ps_cmd.creation_flags(CREATE_NO_WINDOW);

    match ps_cmd.output() {
        Ok(output) => {
            let killed_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let count: u32 = killed_str.parse().unwrap_or(0);
            Ok(count)
        }
        Err(e) => Err(format!("終止進程失敗: {}", e)),
    }
}

fn is_port_free(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn find_available_port(start_port: u16) -> u16 {
    for p in start_port..(start_port + 200) {
        if is_port_free(p) {
            return p;
        }
    }
    start_port
}

#[tauri::command]
fn launch_mode(mode: String, port: u16, low_spec: bool) -> Result<String, String> {
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

    // Determine actual port: if requested port is free, use it; otherwise auto-switch to next available port (Multi-instance support)
    let actual_port = if is_port_free(port) {
        port
    } else {
        find_available_port(port + 1)
    };
    let is_multi = actual_port != port;
    let port_str = actual_port.to_string();

    match mode.as_str() {
        "desktop" => {
            // Standalone desktop mode: Launch python start.py --port <actual_port> --desktop
            let low_spec_arg = if low_spec { " --low-spec" } else { "" };
            let exec_cmd = format!(
                "chcp 65001 >nul & title Aether AI Studio 3.5 [原生桌面服務 - Port {}] & {} start.py --port {} --desktop{}",
                port_str,
                python_bin,
                port_str,
                low_spec_arg
            );

            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/c", &exec_cmd])
                .current_dir(&project_dir);

            #[cfg(windows)]
            cmd.creation_flags(CREATE_NO_WINDOW);

            match cmd.spawn() {
                Ok(_) => {
                    if is_multi {
                        Ok(format!("🚀 連接埠 {} 正在使用中，已自動切換至連接埠 {} 啟動新實例 (多開模式)！", port, actual_port))
                    } else {
                        Ok(format!("✅ 原生獨立桌面版正在連接埠 {} 啟動中，請稍候...", actual_port))
                    }
                }
                Err(e) => Err(format!("桌面模式啟動失敗: {}", e)),
            }
        }
        "cli" => {
            // Terminal CLI mode: Spawn cmd.exe with CREATE_NEW_CONSOLE running start.py
            let low_spec_arg = if low_spec { " --low-spec" } else { "" };
            let exec_cmd = format!(
                "chcp 65001 >nul & title Aether AI Studio 3.5 [CLI 伺服器 - Port {}] & {} start.py --port {} --no-browser{}",
                port_str,
                python_bin,
                port_str,
                low_spec_arg
            );

            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/k", &exec_cmd])
                .current_dir(&project_dir);

            #[cfg(windows)]
            cmd.creation_flags(CREATE_NEW_CONSOLE);

            match cmd.spawn() {
                Ok(_) => {
                    if is_multi {
                        Ok(format!("🚀 連接埠 {} 正在使用中，已自動切換至連接埠 {} 啟動新 CLI 實例 (多開模式)！", port, actual_port))
                    } else {
                        Ok(format!("✅ 已在專屬終端視窗中啟動 CLI 伺服器 (Port {})！", actual_port))
                    }
                }
                Err(e) => Err(format!("終端啟動失敗: {}", e)),
            }
        }
        "browser" => {
            // Browser mode: Spawn cmd.exe with CREATE_NEW_CONSOLE running start.py
            let low_spec_arg = if low_spec { " --low-spec" } else { "" };
            let exec_cmd = format!(
                "chcp 65001 >nul & title Aether AI Studio 3.5 [網頁伺服器 - Port {}] & {} start.py --port {}{}",
                port_str,
                python_bin,
                port_str,
                low_spec_arg
            );

            let mut cmd = Command::new("cmd.exe");
            cmd.args(["/k", &exec_cmd])
                .current_dir(&project_dir);

            #[cfg(windows)]
            cmd.creation_flags(CREATE_NEW_CONSOLE);

            match cmd.spawn() {
                Ok(_) => {
                    if is_multi {
                        Ok(format!("🚀 連接埠 {} 正在使用中，已自動切換至連接埠 {} 啟動伺服器 (多開模式)！", port, actual_port))
                    } else {
                        Ok(format!("✅ 伺服器已在連接埠 {} 啟動，即將為您開啟瀏覽器...", actual_port))
                    }
                }
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
    cleanup_old_launcher();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            check_update,
            apply_update,
            self_update_launcher,
            close_all_instances,
            launch_mode,
            create_desktop_shortcut,
            open_project_folder,
            run_health_check
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
