use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const CREATE_NO_WINDOW: u32 = 0x08000000;
const CREATE_NEW_CONSOLE: u32 = 0x00000010;
const RELEASE_API_URL: &str = "https://api.github.com/repos/hankyleisplay/AetherAI-Studio/releases/latest";
const RELEASE_DOWNLOAD_PREFIX: &str = "https://github.com/hankyleisplay/AetherAI-Studio/releases/download/";

#[derive(Serialize, Deserialize, Debug, Default, Clone)]
pub struct LauncherConfig {
    pub custom_project_path: Option<String>,
}

fn get_config_path() -> PathBuf {
    let home = env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".aether").join("launcher_config.json")
}

fn load_launcher_config() -> LauncherConfig {
    let path = get_config_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<LauncherConfig>(&content) {
                return cfg;
            }
        }
    }
    LauncherConfig::default()
}

fn save_launcher_config(cfg: &LauncherConfig) {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(cfg) {
        let _ = std::fs::write(&path, content);
    }
}

fn git_output(dir: &Path, args: &[&str]) -> Option<std::process::Output> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(dir);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.output().ok()
}

fn git_ok(dir: &Path, args: &[&str]) -> bool {
    git_output(dir, args).map(|o| o.status.success()).unwrap_or(false)
}

fn unix_time() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Single-quoted PowerShell literal. Backslashes are not escapes inside single quotes; only `'` needs doubling.
fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// `find_python` returns either a program path or the two-word launcher form "py -3".
fn python_command(python_bin: &str) -> Command {
    if python_bin == "py -3" {
        let mut c = Command::new("py");
        c.arg("-3");
        c
    } else {
        Command::new(python_bin)
    }
}

/// The same interpreter as text for a `cmd.exe` command line (quoted when the path has spaces).
fn python_for_shell(python_bin: &str) -> String {
    if python_bin != "py -3" && python_bin.contains(' ') && !python_bin.starts_with('"') {
        format!("\"{}\"", python_bin)
    } else {
        python_bin.to_string()
    }
}

/// `cmd.exe <switch> "<command line>"`. The command line is passed verbatim: Rust's normal argument escaping
/// turns inner quotes into `\"`, which cmd.exe does not understand, so a quoted Python path never worked.
fn cmd_shell(switch: &str, command_line: &str) -> Command {
    let mut cmd = Command::new("cmd.exe");
    #[cfg(windows)]
    {
        cmd.raw_arg(switch);
        cmd.raw_arg(format!("\"{}\"", command_line));
    }
    #[cfg(not(windows))]
    {
        cmd.args([switch, command_line]);
    }
    cmd
}

/// Run `pip install -r requirements.txt` for the project. Returns a note for the user when it did not succeed.
fn install_requirements(project_dir: &Path, quiet: bool) -> Option<String> {
    let req_file = project_dir.join("backend").join("requirements.txt");
    if !req_file.exists() {
        return None;
    }
    let python_bin = match find_python() {
        Some(p) => p,
        None => return Some("未偵測到 Python，已略過相依套件安裝。請安裝 Python 3.10+ 後再執行一次。".to_string()),
    };
    let mut pip_cmd = python_command(&python_bin);
    pip_cmd.args(["-m", "pip", "install", "-r"]).arg(&req_file);
    if quiet {
        pip_cmd.arg("--quiet");
    }
    pip_cmd.current_dir(project_dir);
    #[cfg(windows)]
    pip_cmd.creation_flags(CREATE_NO_WINDOW);

    match pip_cmd.output() {
        Ok(out) if out.status.success() => None,
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let last_line = stderr.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
            Some(format!("相依套件安裝未完成 (pip 結束代碼 {})：{}", out.status.code().unwrap_or(-1), last_line))
        }
        Err(e) => Some(format!("無法執行 pip：{}", e)),
    }
}

pub fn parse_semver(v: &str) -> (u32, u32, u32) {
    let clean = v.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let parts: Vec<&str> = clean.split(|c: char| c == '.' || c == '-' || c == '+').collect();
    let major = parts.first().and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    let minor = parts.get(1).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    let patch = parts.get(2).and_then(|s| s.parse::<u32>().ok()).unwrap_or(0);
    (major, minor, patch)
}

pub fn is_newer_version(remote: &str, local: &str) -> bool {
    parse_semver(remote) > parse_semver(local)
}

fn get_project_version(project_dir: &Path) -> Option<String> {
    let pkg_file = project_dir.join("package.json");
    if pkg_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&pkg_file) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(v) = val.get("version").and_then(|v| v.as_str()) {
                    return Some(v.trim().to_string());
                }
            }
        }
    }
    None
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SystemInfo {
    pub project_path: Option<String>,
    pub python_path: Option<String>,
    pub git_available: bool,
    pub current_version: String,
    pub is_ready: bool,
    pub is_installed: bool,
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
        // Only this launcher's own leftovers: the exe may live in Downloads next to unrelated files
        let own_stem = exe_path.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_string();
        if own_stem.is_empty() {
            return;
        }
        if let Some(parent) = exe_path.parent() {
            if let Ok(entries) = std::fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if !name.starts_with(&own_stem) {
                            continue;
                        }
                        if name.ends_with(".exe.bak") || name.contains(".exe.old.") || name.ends_with(".exe.new") {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }
}

pub fn get_default_install_dir() -> PathBuf {
    // 0. If custom project path exists in config
    let cfg = load_launcher_config();
    if let Some(ref custom_path) = cfg.custom_project_path {
        let p = PathBuf::from(custom_path);
        if p.exists() {
            return p;
        }
    }

    // 1. If executable is located in a dedicated custom directory (not Downloads/Desktop/Temp), install in or alongside it
    if let Ok(exe_path) = env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            let parent_str = parent.to_string_lossy().to_lowercase();
            if !parent_str.contains("download") && !parent_str.contains("desktop") && !parent_str.contains("temp") && !parent_str.contains("windows") {
                if parent.join("backend").exists() || parent.join("start.py").exists() {
                    return parent.to_path_buf();
                }
                return parent.join("AetherAI-Studio");
            }
        }
    }

    let home = env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join("AetherAI-Studio")
}

fn find_project_root() -> Option<PathBuf> {
    // 0. Saved custom project path
    let cfg = load_launcher_config();
    if let Some(ref custom_path) = cfg.custom_project_path {
        let p = PathBuf::from(custom_path);
        if p.join("start.py").exists() {
            return Some(p);
        }
    }

    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1. Current working directory & parents
    if let Ok(cwd) = env::current_dir() {
        candidates.push(cwd.clone());
        candidates.push(cwd.join("AetherAI-Studio"));
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.to_path_buf());
            candidates.push(parent.join("AetherAI-Studio"));
        }
    }

    // 2. Executable's directory & parents
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.to_path_buf());
            candidates.push(exe_dir.join("AetherAI-Studio"));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.to_path_buf());
                candidates.push(parent.join("AetherAI-Studio"));
            }
        }
    }

    // 3. Scan all drive roots (Z: down to C: to prioritize custom/virtual workspace drives)
    for drive in (b'C'..=b'Z').rev() {
        let drive_char = drive as char;
        candidates.push(PathBuf::from(format!(r"{}:\AetherAI-Studio", drive_char)));
        candidates.push(PathBuf::from(format!(r"{}:\Project\AetherAI-Studio", drive_char)));
        candidates.push(PathBuf::from(format!(r"{}:\Projects\AetherAI-Studio", drive_char)));
    }

    // 4. Known user home candidate paths
    let home = env::var("USERPROFILE").unwrap_or_default();
    candidates.push(PathBuf::from(format!(r"{}\AetherAI-Studio", home)));
    candidates.push(PathBuf::from(format!(r"{}\Documents\Project\AetherAI-Studio", home)));
    candidates.push(PathBuf::from(format!(r"{}\Documents\AetherAI-Studio", home)));
    candidates.push(PathBuf::from(format!(r"{}\Desktop\AetherAI-Studio", home)));
    candidates.push(PathBuf::from(format!(r"{}\Downloads\AetherAI-Studio", home)));

    // Collect all valid directories that contain start.py
    let mut valid_roots: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for p in candidates {
        if p.join("start.py").exists() {
            let key = p.to_string_lossy().to_lowercase();
            if seen.insert(key) {
                let mtime = std::fs::metadata(p.join("start.py"))
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                valid_roots.push((p, mtime));
            }
        }
    }

    // Sort by modification time descending (most recently updated/modified first)
    valid_roots.sort_by(|a, b| b.1.cmp(&a.1));

    valid_roots.into_iter().next().map(|(p, _)| p)
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

#[tauri::command(async)]
fn get_system_info() -> SystemInfo {
    let args: Vec<String> = env::args().collect();
    let force_install = args.iter().any(|a| a == "--install" || a == "--fresh");

    let project_dir = if force_install {
        None
    } else {
        find_project_root()
    };
    let python_exe = find_python();
    let git = check_git();

    let is_installed = project_dir.is_some();
    let is_ready = is_installed && python_exe.is_some();

    let ver = project_dir
        .as_ref()
        .and_then(|p| get_project_version(p))
        .map(|pv| if is_newer_version(&pv, CURRENT_VERSION) { pv } else { CURRENT_VERSION.to_string() })
        .unwrap_or_else(|| CURRENT_VERSION.to_string());

    SystemInfo {
        project_path: project_dir.map(|p| p.to_string_lossy().to_string()),
        python_path: python_exe,
        git_available: git,
        current_version: ver,
        is_ready,
        is_installed,
    }
}

#[tauri::command(async)]
fn check_update() -> UpdateResult {
    let project_root = find_project_root();
    let project_ver = project_root
        .as_ref()
        .and_then(|p| get_project_version(p))
        .unwrap_or_else(|| CURRENT_VERSION.to_string());

    let current_ver = if is_newer_version(&project_ver, CURRENT_VERSION) {
        project_ver.clone()
    } else {
        CURRENT_VERSION.to_string()
    };

    let mut result = UpdateResult {
        has_update: false,
        current_version: current_ver.clone(),
        latest_version: current_ver.clone(),
        release_name: format!("Aether AI Studio {} (Official Release)", current_ver),
        release_notes: "".to_string(),
        published_at: "".to_string(),
        html_url: "https://github.com/hankyleisplay/AetherAI-Studio/releases".to_string(),
        launcher_download_url: None,
        error: None,
    };

    let mut remote_launcher_url = None;

    // Query GitHub Releases API
    let api_url = "https://api.github.com/repos/hankyleisplay/AetherAI-Studio/releases/latest";
    let resp = ureq::get(api_url)
        .set("User-Agent", &format!("AetherLauncher-v{}", CURRENT_VERSION))
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
                                        remote_launcher_url = Some(url.to_string());
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    let launcher_has_update = is_newer_version(clean_tag, CURRENT_VERSION);
                    let project_has_update = is_newer_version(clean_tag, &project_ver);

                    if launcher_has_update || project_has_update {
                        result.has_update = true;
                        if launcher_has_update {
                            result.launcher_download_url = remote_launcher_url.clone();
                        }
                    }
                }
            }
        }
        Err(e) => {
            result.error = Some(format!("GitHub API 查詢失敗: {}", e));
        }
    }

    result
}

fn download_and_extract_repo(target_dir: &Path) -> Result<(), String> {
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir)
            .map_err(|e| format!("建立目標目錄失敗 ({}): {}", target_dir.display(), e))?;
    }

    // 1. If git is available, try shallow git clone first
    if check_git() {
        let mut clone_cmd = Command::new("git");
        clone_cmd.args(["clone", "--depth", "1", "-b", "main", "https://github.com/hankyleisplay/AetherAI-Studio.git", "."])
            .current_dir(target_dir);
        #[cfg(windows)]
        clone_cmd.creation_flags(CREATE_NO_WINDOW);

        if let Ok(out) = clone_cmd.output() {
            if out.status.success() && target_dir.join("start.py").exists() {
                return Ok(());
            }
        }
    }

    // 2. Fallback: Download zipball from GitHub
    extract_zip_into(target_dir)
}

/// Download the main branch as a zip and unpack it into `target_dir` (which must exist).
fn extract_zip_into(target_dir: &Path) -> Result<(), String> {
    let zip_url = "https://github.com/hankyleisplay/AetherAI-Studio/archive/refs/heads/main.zip";
    let temp_zip = target_dir.join("aether_install_temp.zip");

    let resp = ureq::get(zip_url)
        .set("User-Agent", "AetherLauncher-Installer")
        .timeout(std::time::Duration::from_secs(180))
        .call()
        .map_err(|e| format!("下載核心程式碼失敗 (請確認網路連線): {}", e))?;

    let mut reader = resp.into_reader();
    let mut out_file = std::fs::File::create(&temp_zip)
        .map_err(|e| format!("建立臨時壓縮檔失敗: {}", e))?;

    std::io::copy(&mut reader, &mut out_file)
        .map_err(|e| format!("寫入壓縮檔失敗: {}", e))?;
    drop(out_file);

    // Extract using tar (built into Windows 10/11) with --strip-components=1
    let mut tar_cmd = Command::new("tar");
    tar_cmd.args([
        "-xf",
        &temp_zip.to_string_lossy(),
        "-C",
        &target_dir.to_string_lossy(),
        "--strip-components=1"
    ]);
    #[cfg(windows)]
    tar_cmd.creation_flags(CREATE_NO_WINDOW);

    let tar_ok = match tar_cmd.output() {
        Ok(out) => out.status.success(),
        Err(_) => false,
    };

    if !tar_ok {
        // Fallback: PowerShell Expand-Archive
        let ps_script = format!(
            r#"$tempZip = {}; $target = {}; Expand-Archive -LiteralPath $tempZip -DestinationPath "$target\_temp_extract" -Force; Copy-Item "$target\_temp_extract\AetherAI-Studio-main\*" "$target" -Recurse -Force; Remove-Item "$target\_temp_extract" -Recurse -Force;"#,
            ps_quote(&temp_zip.to_string_lossy()),
            ps_quote(&target_dir.to_string_lossy())
        );
        let mut ps_cmd = Command::new("powershell");
        ps_cmd.args(["-NoProfile", "-Command", &ps_script]);
        #[cfg(windows)]
        ps_cmd.creation_flags(CREATE_NO_WINDOW);
        let _ = ps_cmd.output();
    }

    if temp_zip.exists() {
        let _ = std::fs::remove_file(temp_zip);
    }

    if !target_dir.join("start.py").exists() {
        return Err("解壓縮核心檔案失敗，未找到 start.py。".to_string());
    }

    Ok(())
}

/// Copy every file under `src` that does not exist under `dst` (skips .git). Returns how many were copied.
fn copy_missing_files(src: &Path, dst: &Path) -> std::io::Result<usize> {
    let mut copied = 0;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        if name == ".git" {
            continue;
        }
        let from = entry.path();
        let to = dst.join(&name);
        if entry.file_type()?.is_dir() {
            std::fs::create_dir_all(&to)?;
            copied += copy_missing_files(&from, &to)?;
        } else if !to.exists() {
            std::fs::copy(&from, &to)?;
            copied += 1;
        }
    }
    Ok(copied)
}

/// "Repair" puts back core files that are missing. It never overwrites a file that exists, so the user's own
/// changes are safe. Returns how many files were restored.
fn restore_missing_core_files(project_dir: &Path) -> Result<usize, String> {
    if project_dir.join(".git").exists() && check_git() {
        let out = git_output(project_dir, &["ls-files", "--deleted", "-z"])
            .ok_or_else(|| "無法執行 git 檢查遺失檔案".to_string())?;
        let listing = String::from_utf8_lossy(&out.stdout).to_string();
        let deleted: Vec<&str> = listing.split('\0').filter(|f| !f.is_empty()).collect();
        if deleted.is_empty() {
            return Ok(0);
        }
        let mut args = vec!["checkout", "--"];
        args.extend(deleted.iter().copied());
        if !git_ok(project_dir, &args) {
            return Err("git 無法還原遺失的檔案".to_string());
        }
        return Ok(deleted.len());
    }

    // Not a git checkout: unpack a fresh copy elsewhere and copy over only what is missing
    let temp = env::temp_dir().join(format!("aether_repair_{}", unix_time()));
    std::fs::create_dir_all(&temp).map_err(|e| format!("建立暫存資料夾失敗: {}", e))?;
    let result = extract_zip_into(&temp)
        .and_then(|_| copy_missing_files(&temp, project_dir).map_err(|e| format!("複製核心檔案失敗: {}", e)));
    let _ = std::fs::remove_dir_all(&temp);
    result
}

#[tauri::command(async)]
fn install_or_repair_core(target_path: Option<String>) -> Result<String, String> {
    let install_dir = if let Some(p) = target_path {
        if !p.trim().is_empty() {
            PathBuf::from(p)
        } else {
            get_default_install_dir()
        }
    } else {
        match find_project_root() {
            Some(p) => p,
            None => get_default_install_dir(),
        }
    };

    // 1. Fresh install, or put back missing core files of an existing one
    let mut repair_note = String::new();
    if !install_dir.join("start.py").exists() {
        download_and_extract_repo(&install_dir)?;
    } else {
        repair_note = match restore_missing_core_files(&install_dir) {
            Ok(0) => "核心檔案完整，無須修復。\n".to_string(),
            Ok(n) => format!("已補回 {} 個遺失的核心檔案（未覆蓋任何既有檔案）。\n", n),
            Err(e) => format!("⚠️ 檢查核心檔案時發生問題：{}\n", e),
        };
    }

    // 2. Install Python dependencies
    let pip_note = install_requirements(&install_dir, false);

    // 3. Create desktop shortcut
    let _ = create_desktop_shortcut();

    match pip_note {
        None => Ok(format!(
            "🎉 Aether AI Studio {} 核心檔案與相依套件已安裝完成！\n{}安裝路徑: {}",
            CURRENT_VERSION,
            repair_note,
            install_dir.display()
        )),
        // The files are in place, so this is not a failure, but the user must know the app may not start yet
        Some(note) => Ok(format!(
            "⚠️ 核心檔案已就緒，但{}\n{}安裝路徑: {}",
            note,
            repair_note,
            install_dir.display()
        )),
    }
}

#[tauri::command(async)]
fn install_python() -> Result<String, String> {
    // 1. Try winget install
    let mut winget = Command::new("winget");
    winget.args([
        "install", "-e", "--id", "Python.Python.3.12",
        "--accept-source-agreements", "--accept-package-agreements"
    ]);
    #[cfg(windows)]
    winget.creation_flags(CREATE_NEW_CONSOLE);

    if let Ok(mut child) = winget.spawn() {
        let _ = child.wait();
        if find_python().is_some() {
            return Ok("Python 安裝成功！".to_string());
        }
    }

    // 2. Fallback: open python.org
    let _ = Command::new("cmd.exe")
        .args(["/c", "start", "https://www.python.org/downloads/"])
        .spawn();

    Ok("已開啟 Python 官方下載頁面，請下載安裝並務必勾選「Add Python to PATH」。".to_string())
}

#[tauri::command]
fn select_custom_project_dir(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.join("start.py").exists() {
        return Err("所選目錄未包含 start.py，並非有效的 Aether AI Studio 專案目錄。".to_string());
    }
    let mut cfg = load_launcher_config();
    cfg.custom_project_path = Some(path.clone());
    save_launcher_config(&cfg);
    Ok(format!("已成功設定並儲存專案目錄: {}", path))
}

#[tauri::command(async)]
fn apply_update() -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => return Err("找不到專案目錄，無法執行更新。".to_string()),
    };

    let git_dir = project_dir.join(".git");
    if git_dir.exists() && check_git() {
        // 1. Fetch remote updates
        let mut fetch_cmd = Command::new("git");
        fetch_cmd.args(["fetch", "origin", "main"]).current_dir(&project_dir);
        #[cfg(windows)]
        fetch_cmd.creation_flags(CREATE_NO_WINDOW);

        let fetch_res = fetch_cmd.output();
        let fetch_ok = fetch_res.as_ref().map(|o| o.status.success()).unwrap_or(false);

        if !fetch_ok {
            // Try fetching origin generally
            let mut fetch_all = Command::new("git");
            fetch_all.args(["fetch", "origin"]).current_dir(&project_dir);
            #[cfg(windows)]
            fetch_all.creation_flags(CREATE_NO_WINDOW);
            let fetch_all_ok = fetch_all.output().map(|o| o.status.success()).unwrap_or(false);
            if !fetch_all_ok {
                return Err("無法從 GitHub 遠端獲取更新，請檢查網路連線或 GitHub 存取權限。".to_string());
            }
        }

        // 2. Put local changes aside only if there are any, under a name the user can find again
        let dirty = git_output(&project_dir, &["status", "--porcelain"])
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false);
        let stash_name = format!("aether-auto-update-{}", unix_time());
        if dirty && !git_ok(&project_dir, &["stash", "push", "--include-untracked", "-m", &stash_name]) {
            return Err("無法暫存你的本地修改，為避免覆蓋檔案已取消更新。".to_string());
        }

        // 3. Fast-forward only. A failed merge used to end in `git reset --hard`, discarding local commits.
        if !git_ok(&project_dir, &["merge", "--ff-only", "origin/main"]) {
            if dirty {
                let _ = git_ok(&project_dir, &["stash", "pop"]);
            }
            return Err("你的專案有尚未推送的本地提交，無法自動更新；檔案都沒有被更動。請手動執行 git pull 合併。".to_string());
        }

        // 4. Bring the local changes back
        let mut stash_note = String::new();
        if dirty {
            if git_ok(&project_dir, &["stash", "apply"]) {
                let _ = git_ok(&project_dir, &["stash", "drop"]);
            } else {
                // Conflicts with the new version: clear the half-applied state, keep the stash for the user
                let _ = git_ok(&project_dir, &["reset", "--hard", "HEAD"]);
                stash_note = format!(
                    "\n⚠️ 你的部分本地修改與新版衝突，已完整保存在 git stash「{}」，可用 git stash list 查看後手動還原。",
                    stash_name
                );
            }
        }

        // 5. Update python dependencies in case requirements changed
        let pip_note = install_requirements(&project_dir, true);

        // 6. Purge Chromium profile caches so updated assets and HTML load immediately
        let home = env::var("USERPROFILE").unwrap_or_default();
        let cache_dir = PathBuf::from(&home).join(".aether").join("desktop_profile").join("Default").join("Cache");
        let code_cache_dir = PathBuf::from(&home).join(".aether").join("desktop_profile").join("Default").join("Code Cache");
        let _ = std::fs::remove_dir_all(&cache_dir);
        let _ = std::fs::remove_dir_all(&code_cache_dir);

        match pip_note {
            None => Ok(format!("✅ 已成功更新至主分支最新版本，並自動同步相依套件與快取！{}", stash_note)),
            Some(note) => Ok(format!("✅ 已更新至主分支最新版本。⚠️ {}{}", note, stash_note)),
        }
    } else {
        // Non-git installation: download and update files directly
        download_and_extract_repo(&project_dir)?;
        let home = env::var("USERPROFILE").unwrap_or_default();
        let cache_dir = PathBuf::from(&home).join(".aether").join("desktop_profile").join("Default").join("Cache");
        let code_cache_dir = PathBuf::from(&home).join(".aether").join("desktop_profile").join("Default").join("Code Cache");
        let _ = std::fs::remove_dir_all(&cache_dir);
        let _ = std::fs::remove_dir_all(&code_cache_dir);
        Ok("✅ 已成功下載並更新最新核心檔案！".to_string())
    }
}

struct LauncherAsset {
    url: String,
    /// "sha256:<hex>" as published by GitHub for the release asset
    digest: Option<String>,
}

fn latest_launcher_asset() -> Result<LauncherAsset, String> {
    let resp = ureq::get(RELEASE_API_URL)
        .set("User-Agent", &format!("AetherLauncher-v{}", CURRENT_VERSION))
        .set("Accept", "application/vnd.github.v3+json")
        .timeout(std::time::Duration::from_secs(8))
        .call()
        .map_err(|e| format!("GitHub API 連線失敗: {}", e))?;

    let json: serde_json::Value = resp.into_json().map_err(|e| format!("解析回應失敗: {}", e))?;
    let assets = json.get("assets").and_then(|a| a.as_array()).cloned().unwrap_or_default();
    for asset in assets {
        if asset.get("name").and_then(|n| n.as_str()) != Some("AetherLauncher.exe") {
            continue;
        }
        if let Some(url) = asset.get("browser_download_url").and_then(|u| u.as_str()) {
            return Ok(LauncherAsset {
                url: url.to_string(),
                digest: asset.get("digest").and_then(|d| d.as_str()).map(|d| d.to_lowercase()),
            });
        }
    }
    Err("在最新 GitHub Release 中未找到 AetherLauncher.exe 發行資產。".to_string())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("讀取檔案失敗: {}", e))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).map_err(|e| format!("讀取檔案失敗: {}", e))?;
    Ok(hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect())
}

#[tauri::command(async)]
fn self_update_launcher(download_url: Option<String>) -> Result<String, String> {
    let current_exe = match env::current_exe() {
        Ok(p) => p,
        Err(e) => return Err(format!("無法獲取當前執行檔路徑: {}", e)),
    };

    // The executable replaces this one, so it must come from this project's releases and match the published
    // hash. The page may pass a URL, but only one on the release download path is accepted, and the hash is
    // always looked up from the GitHub API.
    if let Some(url) = download_url.as_deref() {
        if !url.trim().is_empty() && !url.starts_with(RELEASE_DOWNLOAD_PREFIX) {
            return Err("更新來源不是官方 GitHub Release，已拒絕。".to_string());
        }
    }
    let asset = latest_launcher_asset()?;
    let target_url = asset.url.clone();
    if !target_url.starts_with(RELEASE_DOWNLOAD_PREFIX) {
        return Err("更新來源不是官方 GitHub Release，已拒絕。".to_string());
    }

    // 1. Download to temporary file
    let temp_exe = current_exe.with_extension("exe.new");
    if temp_exe.exists() {
        let _ = std::fs::remove_file(&temp_exe);
    }

    let resp = ureq::get(&target_url)
        .set("User-Agent", "AetherLauncher-Updater")
        .timeout(std::time::Duration::from_secs(300))
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

    let mut verify_note = "（已通過 SHA-256 驗證）";
    match asset.digest.as_deref() {
        Some(digest) if digest.starts_with("sha256:") => {
            let actual = sha256_file(&temp_exe)?;
            if actual != digest["sha256:".len()..] {
                let _ = std::fs::remove_file(&temp_exe);
                return Err("下載的啟動器與官方發佈的 SHA-256 不符，可能已損毀或遭竄改，已取消更新。".to_string());
            }
        }
        // Releases published before GitHub added asset digests have none to compare with
        _ => verify_note = "（此 Release 未提供雜湊值，僅檢查檔案大小）",
    }

    // 2. Generate unique timestamped backup name to prevent collision
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_exe = current_exe.with_extension(format!("exe.old.{}", timestamp));

    std::fs::rename(&current_exe, &backup_exe)
        .map_err(|e| format!("備份現有啟動器失敗 (可能被鎖定): {}", e))?;

    // 3. Move new exe to original path
    if let Err(e) = std::fs::rename(&temp_exe, &current_exe) {
        let _ = std::fs::rename(&backup_exe, &current_exe);
        return Err(format!("替換新版啟動器失敗: {}", e));
    }

    // 4. Spawn the new exe (NO CREATE_NO_WINDOW so the GUI window renders immediately)
    let mut cmd = Command::new(&current_exe);
    if let Some(parent) = current_exe.parent() {
        cmd.current_dir(parent);
    }
    #[cfg(windows)]
    {
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        cmd.creation_flags(CREATE_NEW_PROCESS_GROUP);
    }

    cmd.spawn().map_err(|e| format!("重新啟動新版啟動器失敗: {}", e))?;

    // 5. Exit the current process after short delay
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(300));
        std::process::exit(0);
    });

    Ok(format!("✅ 啟動器已成功更新至最新版{}，正在為您自動重新啟動...", verify_note))
}

#[tauri::command(async)]
fn close_all_instances(port: u16) -> Result<u32, String> {
    let port_str = port.to_string();

    // Only processes that are recognisably Aether: its own start script with a --port argument, the health check,
    // an app-mode browser window on this port, and whatever listens on the port *if* it is our server. Matching any
    // command line containing "start.py", or any process on the port, killed unrelated programs.
    let ps_script = format!(
        r#"$killed = 0
$ids = @()
$sig = "CommandLine LIKE '%start.py%--port%' OR CommandLine LIKE '%test_backend.py%' OR CommandLine LIKE '%--app=http://localhost:{port}%' OR CommandLine LIKE '%--app=http://127.0.0.1:{port}%'"
$ids += @(Get-CimInstance Win32_Process -Filter $sig -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessId)
$conns = @(Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue)
foreach ($c in $conns) {{
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)" -ErrorAction SilentlyContinue
    if ($owner -and $owner.CommandLine -match 'start\.py|uvicorn|backend\.app\.main') {{ $ids += $owner.ProcessId }}
}}
foreach ($id in ($ids | Select-Object -Unique | Where-Object {{ $_ -gt 0 -and $_ -ne $PID }})) {{
    try {{
        Stop-Process -Id $id -Force -ErrorAction Stop
        $killed++
    }} catch {{}}
}}
Write-Output $killed"#,
        port = port_str
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
    // Saturating: near 65535 the plain `+ 200` overflowed u16
    for p in start_port..=start_port.saturating_add(200) {
        if is_port_free(p) {
            return p;
        }
    }
    start_port
}

#[tauri::command(async)]
fn launch_mode(mode: String, port: u16, low_spec: bool) -> Result<String, String> {
    // If project is not installed yet, auto-install first!
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => {
            // Auto install!
            install_or_repair_core(None)?;
            match find_project_root() {
                Some(p) => p,
                None => return Err("自動安裝完成後仍無法定位核心專案目錄，請重新開啟啟動器。".to_string()),
            }
        }
    };

    let python_bin = match find_python() {
        Some(p) => p,
        None => return Err("找不到系統 Python。請確認已安裝 Python 3.10+ 並加入系統 PATH。".to_string()),
    };

    let quoted_python = python_for_shell(&python_bin);

    let start_py = project_dir.join("start.py");
    if !start_py.exists() {
        return Err(format!("主程式檔案不存在: {}", start_py.display()));
    }

    // Determine actual port: auto-switch to next available port (Multi-instance support)
    let actual_port = if is_port_free(port) {
        port
    } else {
        find_available_port(port.saturating_add(1))
    };
    let is_multi = actual_port != port;
    let port_str = actual_port.to_string();

    match mode.as_str() {
        "desktop" => {
            let low_spec_arg = if low_spec { " --low-spec" } else { "" };
            let exec_cmd = format!(
                "chcp 65001 >nul & title Aether AI Studio {} [原生桌面服務 - Port {}] & {} start.py --port {} --desktop{}",
                CURRENT_VERSION,
                port_str,
                quoted_python,
                port_str,
                low_spec_arg
            );

            let mut cmd = cmd_shell("/c", &exec_cmd);
            cmd.current_dir(&project_dir);

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
            let low_spec_arg = if low_spec { " --low-spec" } else { "" };
            let exec_cmd = format!(
                "chcp 65001 >nul & title Aether AI Studio {} [CLI 伺服器 - Port {}] & {} start.py --port {} --no-browser{}",
                CURRENT_VERSION,
                port_str,
                quoted_python,
                port_str,
                low_spec_arg
            );

            let mut cmd = cmd_shell("/k", &exec_cmd);
            cmd.current_dir(&project_dir);

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
            let low_spec_arg = if low_spec { " --low-spec" } else { "" };
            let exec_cmd = format!(
                "chcp 65001 >nul & title Aether AI Studio {} [網頁伺服器 - Port {}] & {} start.py --port {}{}",
                CURRENT_VERSION,
                port_str,
                quoted_python,
                port_str,
                low_spec_arg
            );

            let mut cmd = cmd_shell("/k", &exec_cmd);
            cmd.current_dir(&project_dir);

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

#[tauri::command(async)]
fn create_desktop_shortcut() -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => get_default_install_dir(),
    };

    let launcher_exe = if let Ok(exe) = env::current_exe() {
        exe.to_string_lossy().to_string()
    } else {
        project_dir.join("AetherLauncher.exe").to_string_lossy().to_string()
    };

    // Ensure high-resolution icon file exists in project directory
    let icon_path = project_dir.join("icon.ico");
    if !icon_path.exists() {
        let icon_bytes = include_bytes!("../icons/icon.ico");
        let _ = std::fs::write(&icon_path, icon_bytes);
    }
    let icon_location = if icon_path.exists() {
        icon_path.to_string_lossy().to_string()
    } else {
        launcher_exe.clone()
    };

    let ps_script = format!(
        r#"$desktop = [Environment]::GetFolderPath('Desktop');
$s = (New-Object -COM WScript.Shell).CreateShortcut("$desktop\Aether AI Studio.lnk");
$s.TargetPath = {};
$s.WorkingDirectory = {};
$s.Description = 'Aether AI Studio 官方專屬啟動器';
$s.IconLocation = {};
$s.Save();"#,
        ps_quote(&launcher_exe),
        ps_quote(&project_dir.to_string_lossy()),
        ps_quote(&format!("{},0", icon_location))
    );

    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", &ps_script]);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(output) => {
            if output.status.success() {
                Ok(format!("⭐ 成功在您的 Windows 桌面建立「Aether AI Studio {}」捷徑！", CURRENT_VERSION))
            } else {
                Err(format!("建立捷徑失敗: {}", String::from_utf8_lossy(&output.stderr)))
            }
        }
        Err(e) => Err(format!("PowerShell 執行失敗: {}", e)),
    }
}

#[tauri::command(async)]
fn open_project_folder() -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => get_default_install_dir(),
    };

    if !project_dir.exists() {
        let _ = std::fs::create_dir_all(&project_dir);
    }

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

#[tauri::command(async)]
fn run_health_check() -> Result<String, String> {
    let project_dir = match find_project_root() {
        Some(p) => p,
        None => return Err("尚未安裝核心檔案，請先點擊一鍵安裝。".to_string()),
    };

    let python_bin = match find_python() {
        Some(p) => p,
        None => return Err("找不到 Python。".to_string()),
    };

    let exec_cmd = format!(
        "chcp 65001 >nul & title Aether AI Studio {} [系統檢測] & {} test_backend.py & pause",
        CURRENT_VERSION,
        python_for_shell(&python_bin)
    );

    let mut cmd = cmd_shell("/k", &exec_cmd);
    cmd.current_dir(&project_dir);

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
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = window.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            check_update,
            apply_update,
            self_update_launcher,
            select_custom_project_dir,
            close_all_instances,
            launch_mode,
            create_desktop_shortcut,
            open_project_folder,
            run_health_check,
            install_or_repair_core,
            install_python
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
