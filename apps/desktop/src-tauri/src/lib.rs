use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopSettings {
    manager_root: Option<PathBuf>,
    node_path: Option<PathBuf>,
}

fn allowed(args: &[String]) -> bool {
    if args.len() < 2 {
        return false;
    }
    matches!(
        (args[0].as_str(), args[1].as_str()),
        ("project", "list")
            | ("project", "sync")
            | ("project", "show")
            | ("project", "validate")
            | ("task", "list")
            | ("task", "show")
            | ("task", "pause")
            | ("task", "resume")
            | ("task", "complete")
            | ("task", "doctor")
            | ("env", "start")
            | ("env", "stop")
            | ("env", "status")
    )
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("desktop-settings.json"))
        .map_err(|error| format!("无法定位桌面设置目录：{error}"))
}

fn read_settings(app: &AppHandle) -> Result<DesktopSettings, String> {
    let path = settings_path(app)?;
    let mut settings = match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).map_err(|error| format!("桌面设置文件无效：{error}"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => DesktopSettings::default(),
        Err(error) => return Err(format!("无法读取桌面设置：{error}")),
    };
    if let Ok(root) = std::env::var("WM_MANAGER_ROOT") {
        settings.manager_root = Some(PathBuf::from(root));
    }
    if let Ok(node) = std::env::var("WM_NODE_BIN") {
        settings.node_path = Some(PathBuf::from(node));
    }
    Ok(settings)
}

fn validate_manager_root(path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|error| format!("工作管理仓库路径不可用：{error}"))?;
    if !canonical.join("projects").is_dir() {
        return Err("工作管理仓库必须包含 projects 目录".into());
    }
    Ok(canonical)
}

fn validate_project_name(value: &str) -> Result<&str, String> {
    let name = value.trim();
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
    {
        return Err("项目名称不能为空且不能包含路径分隔符".into());
    }
    Ok(name)
}

fn prepare_project_target(parent: &Path, project_name: &str) -> Result<PathBuf, String> {
    let parent = parent
        .canonicalize()
        .map_err(|error| format!("项目目录不可用：{error}"))?;
    if !parent.is_dir() {
        return Err("请选择一个有效的本机目录".into());
    }
    let target = parent.join(validate_project_name(project_name)?);
    if target.exists() {
        return Err("该目录下已存在同名项目，请修改名称或选择其他位置".into());
    }
    Ok(target)
}

fn copy_template_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| format!("无法创建项目目录：{error}"))?;
    for entry in fs::read_dir(source).map_err(|error| format!("无法读取项目模板：{error}"))? {
        let entry = entry.map_err(|error| error.to_string())?;
        let destination = target.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            copy_template_directory(&entry.path(), &destination)?;
        } else {
            fs::copy(entry.path(), destination)
                .map_err(|error| format!("无法复制项目模板：{error}"))?;
        }
    }
    Ok(())
}

fn template_path(app: &AppHandle) -> Result<PathBuf, String> {
    let template = app
        .path()
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录：{error}"))?
        .join("templates/work-manager");
    if !template.is_dir() {
        return Err(format!("应用内置项目模板缺失：{}", template.display()));
    }
    Ok(template)
}

fn save_settings(app: &AppHandle, settings: DesktopSettings) -> Result<DesktopSettings, String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建桌面设置目录：{error}"))?;
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(&settings).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("无法写入桌面设置：{error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("无法保存桌面设置：{error}"))?;
    Ok(settings)
}

fn resolve_work_manager_database_path<F>(current_dir: &Path, env: F) -> Result<PathBuf, String>
where
    F: Fn(&str) -> Option<OsString>,
{
    let path = if let Some(database) = env("WM_DATABASE_PATH") {
        PathBuf::from(database)
    } else if let Some(app_data) = env("WM_APP_DATA_DIR") {
        PathBuf::from(app_data).join("work-manager.db")
    } else {
        PathBuf::from(env("HOME").unwrap_or_else(|| current_dir.as_os_str().to_owned()))
            .join("Library/Application Support/work-manager/work-manager.db")
    };
    Ok(if path.is_absolute() {
        path
    } else {
        current_dir.join(path)
    })
}

fn work_manager_database_path(current_dir: &Path) -> Result<PathBuf, String> {
    resolve_work_manager_database_path(current_dir, |name| std::env::var_os(name))
}

fn remove_database_files(database: &Path) -> Result<(), String> {
    for path in [
        database.to_path_buf(),
        PathBuf::from(format!("{}-wal", database.display())),
        PathBuf::from(format!("{}-shm", database.display())),
    ] {
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("无法清空本地数据库：{error}")),
        }
    }
    Ok(())
}

fn remove_empty_directory(path: &Path) {
    if fs::read_dir(path)
        .ok()
        .and_then(|mut entries| entries.next())
        .is_none()
    {
        let _ = fs::remove_dir(path);
    }
}

fn validate_node(path: &Path) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|error| format!("Node.js 路径不可用：{error}"))?;
    if !canonical.is_file() {
        return Err("Node.js 路径必须指向可执行文件".into());
    }
    let status = Command::new(&canonical)
        .arg("--version")
        .status()
        .map_err(|error| format!("无法执行 Node.js：{error}"))?;
    if !status.success() {
        return Err("Node.js 版本检查失败".into());
    }
    Ok(canonical)
}

fn ensure_within(target: &Path, root: &Path, label: &str) -> Result<(), String> {
    if target.starts_with(root) {
        Ok(())
    } else {
        Err(format!("{label}不在允许的目录内"))
    }
}

fn find_node(settings: &DesktopSettings) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Some(path) = &settings.node_path {
        candidates.push(path.clone());
    }
    candidates.push(PathBuf::from("/opt/homebrew/bin/node"));
    candidates.push(PathBuf::from("/usr/local/bin/node"));
    candidates.push(PathBuf::from("/usr/bin/node"));
    candidates
        .into_iter()
        .find_map(|candidate| validate_node(&candidate).ok())
        .ok_or_else(|| "找不到 Node.js，请在设置中填写 node 可执行文件的绝对路径".into())
}

fn run_wm(app: &AppHandle, mut args: Vec<String>) -> Result<Value, String> {
    if !allowed(&args) {
        return Err("桌面端不允许执行该 wm 命令".into());
    }
    if !args.iter().any(|arg| arg == "--json") {
        args.push("--json".into());
    }
    let settings = read_settings(app)?;
    let manager_root = validate_manager_root(
        settings
            .manager_root
            .as_deref()
            .ok_or("尚未配置工作管理仓库，请先前往设置")?,
    )?;

    let mut command = if let Ok(binary) = std::env::var("WM_BIN") {
        Command::new(binary)
    } else {
        let node = find_node(&settings)?;
        let resource = app
            .path()
            .resource_dir()
            .map_err(|error| format!("无法定位应用资源目录：{error}"))?
            .join("resources")
            .join("wm.mjs");
        if !resource.is_file() {
            return Err(format!("应用内置 wm 资源缺失：{}", resource.display()));
        }
        let mut command = Command::new(node);
        command.arg(resource);
        command
    };
    let output = command
        .args(&args)
        .current_dir(&manager_root)
        .env("WM_MANAGER_ROOT", &manager_root)
        .output()
        .map_err(|error| format!("无法启动 wm：{error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout).map_err(|error| {
        let stderr = String::from_utf8_lossy(&output.stderr);
        format!("wm 返回无效 JSON：{error}；{}", stderr.trim())
    })
}

#[tauri::command]
fn wm_command(app: AppHandle, args: Vec<String>) -> Result<Value, String> {
    run_wm(&app, args)
}

#[tauri::command]
fn get_desktop_settings(app: AppHandle) -> Result<DesktopSettings, String> {
    read_settings(&app)
}

#[tauri::command]
fn save_desktop_settings(
    app: AppHandle,
    manager_root: String,
    node_path: Option<String>,
) -> Result<DesktopSettings, String> {
    let settings = DesktopSettings {
        manager_root: Some(validate_manager_root(Path::new(&manager_root))?),
        node_path: match node_path.filter(|value| !value.trim().is_empty()) {
            Some(path) => Some(validate_node(Path::new(&path))?),
            None => None,
        },
    };
    save_settings(&app, settings)
}

#[tauri::command]
fn initialize_codex_project(
    app: AppHandle,
    project_name: String,
    parent_directory: String,
) -> Result<DesktopSettings, String> {
    let target = prepare_project_target(Path::new(&parent_directory), &project_name)?;
    let template = template_path(&app)?;
    if let Err(error) = copy_template_directory(&template, &target) {
        remove_empty_directory(&target);
        return Err(error);
    }
    let settings = read_settings(&app)?;
    let next_settings = DesktopSettings {
        manager_root: Some(validate_manager_root(&target)?),
        node_path: settings.node_path,
    };
    match save_settings(&app, next_settings) {
        Ok(settings) => Ok(settings),
        Err(error) => {
            remove_empty_directory(&target);
            Err(error)
        }
    }
}

#[tauri::command]
fn clear_desktop_data(app: AppHandle) -> Result<DesktopSettings, String> {
    let settings = read_settings(&app)?;
    let current_dir = settings
        .manager_root
        .clone()
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|error| format!("无法定位当前工作目录：{error}"))?;
    remove_database_files(&work_manager_database_path(&current_dir)?)?;
    save_settings(
        &app,
        DesktopSettings {
            manager_root: None,
            node_path: settings.node_path,
        },
    )
}

#[tauri::command]
fn open_worktree(app: AppHandle, task_id: String) -> Result<(), String> {
    let response = run_wm(
        &app,
        vec!["task".into(), "show".into(), task_id, "--json".into()],
    )?;
    let path = response
        .pointer("/data/task/worktreePath")
        .and_then(Value::as_str)
        .ok_or("任务没有已登记的 worktree")?;
    let target = Path::new(path)
        .canonicalize()
        .map_err(|error| format!("worktree 路径不可用：{error}"))?;
    if !target.is_dir() {
        return Err("只能在 Finder 中打开目录".into());
    }
    Command::new("open")
        .arg(target)
        .status()
        .map_err(|error| error.to_string())
        .and_then(|status| if status.success() { Ok(()) } else { Err("Finder 打开失败".into()) })
}

#[tauri::command]
fn open_artifact(app: AppHandle, task_id: String, kind: String) -> Result<(), String> {
    if !matches!(kind.as_str(), "requirements" | "context" | "plan" | "progress" | "completion") {
        return Err("不支持的工件类型".into());
    }
    let response = run_wm(
        &app,
        vec!["task".into(), "show".into(), task_id, "--json".into()],
    )?;
    let files = response
        .pointer("/data/artifactFiles")
        .and_then(Value::as_array)
        .ok_or("任务没有已登记的工件")?;
    let path = files
        .iter()
        .find(|entry| entry.get("kind").and_then(Value::as_str) == Some(kind.as_str()))
        .and_then(|entry| entry.get("path"))
        .and_then(Value::as_str)
        .ok_or("找不到指定工件")?;
    let target = Path::new(path)
        .canonicalize()
        .map_err(|error| format!("工件路径不可用：{error}"))?;
    let settings = read_settings(&app)?;
    let manager_root = validate_manager_root(
        settings.manager_root.as_deref().ok_or("尚未配置工作管理仓库，请先前往设置")?,
    )?;
    let artifacts_root = manager_root
        .join("data")
        .join("artifacts")
        .canonicalize()
        .map_err(|error| format!("工件根目录不可用：{error}"))?;
    ensure_within(&target, &artifacts_root, "工件")?;
    if !target.is_file() {
        return Err("只能打开已登记的工件文件".into());
    }
    Command::new("open")
        .arg(target)
        .status()
        .map_err(|error| error.to_string())
        .and_then(|status| if status.success() { Ok(()) } else { Err("工件打开失败".into()) })
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.chars().any(char::is_whitespace) {
        return Err("只允许打开有效的 HTTP(S) URL".into());
    }
    Command::new("open")
        .arg(url)
        .status()
        .map_err(|error| error.to_string())
        .and_then(|status| if status.success() { Ok(()) } else { Err("URL 打开失败".into()) })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            wm_command,
            get_desktop_settings,
            save_desktop_settings,
            initialize_codex_project,
            clear_desktop_data,
            open_worktree,
            open_artifact,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("启动工作管理器失败");
}

#[cfg(test)]
mod tests {
    use super::{
        allowed, copy_template_directory, ensure_within, prepare_project_target,
        remove_database_files, resolve_work_manager_database_path, validate_project_name,
    };
    use std::ffi::OsString;
    use std::fs::{self, File};
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_directory(prefix: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("{prefix}-{nonce}"))
    }

    #[test]
    fn 初始化仅接受单层名称并复制完整模板() {
        let root = temp_directory("wm-init");
        let template = root.join("template");
        fs::create_dir_all(template.join("projects")).unwrap();
        File::create(template.join("projects/demo.yaml")).unwrap();

        let target = prepare_project_target(&root, "我的项目").unwrap();
        copy_template_directory(&template, &target).unwrap();

        assert!(target.join("projects/demo.yaml").is_file());
        assert!(prepare_project_target(&root, "我的项目").is_err());
        assert!(validate_project_name("../危险").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn 清空数据库会删除主文件和_wal_shm文件() {
        let root = temp_directory("wm-clear-database");
        fs::create_dir_all(&root).unwrap();
        let database = root.join("work-manager.db");
        let wal = root.join("work-manager.db-wal");
        let shm = root.join("work-manager.db-shm");
        File::create(&database).unwrap();
        File::create(&wal).unwrap();
        File::create(&shm).unwrap();

        remove_database_files(&database).unwrap();

        assert!(!database.exists());
        assert!(!wal.exists());
        assert!(!shm.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn 数据库路径优先使用_wm_database_path() {
        let path = resolve_work_manager_database_path(Path::new("/工作目录"), |name| match name {
            "WM_DATABASE_PATH" => Some(OsString::from("/指定目录/custom.db")),
            "WM_APP_DATA_DIR" => Some(OsString::from("/应用数据")),
            "HOME" => Some(OsString::from("/用户目录")),
            _ => None,
        })
        .unwrap();

        assert_eq!(path, Path::new("/指定目录/custom.db"));
    }

    #[test]
    fn 数据库路径其次使用_wm_app_data_dir() {
        let path = resolve_work_manager_database_path(Path::new("/工作目录"), |name| match name {
            "WM_APP_DATA_DIR" => Some(OsString::from("/应用数据")),
            "HOME" => Some(OsString::from("/用户目录")),
            _ => None,
        })
        .unwrap();

        assert_eq!(path, Path::new("/应用数据/work-manager.db"));
    }

    #[test]
    fn desktop_command_allowlist_rejects_mutating_resource_commands() {
        assert!(allowed(&["task".into(), "list".into()]));
        assert!(allowed(&["env".into(), "start".into()]));
        assert!(!allowed(&["task".into(), "create".into()]));
        assert!(!allowed(&["workspace".into(), "delete".into()]));
    }

    #[test]
    fn desktop_path_guard_rejects_paths_outside_root() {
        assert!(ensure_within(Path::new("/workspace/data/artifacts/A/progress.md"), Path::new("/workspace/data/artifacts"), "工件").is_ok());
        assert!(ensure_within(Path::new("/workspace/secrets.txt"), Path::new("/workspace/data/artifacts"), "工件").is_err());
    }
}
