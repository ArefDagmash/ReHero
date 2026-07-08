use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct KokoroServer {
    child: Mutex<Option<Child>>,
}

impl Drop for KokoroServer {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(ref mut child) = *guard {
                let _ = child.kill();
                println!("[ReHero] Kokoro server stopped");
            }
        }
    }
}

#[tauri::command]
fn start_kokoro(state: tauri::State<KokoroServer>) -> Result<String, String> {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = *guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
            }
            Ok(None) => return Ok("already-running".into()),
            Err(_) => *guard = None,
        }
    }

    let python = std::env::current_dir()
        .unwrap_or_default()
        .join("../VoicetoSpeechwithMath/venv/bin/python");

    let server_script = std::env::current_dir()
        .unwrap_or_default()
        .join("kokoro_server.py");

    if !python.exists() {
        return Err(format!("Python venv not found at {}", python.display()));
    }
    if !server_script.exists() {
        return Err(format!("Server script not found at {}", server_script.display()));
    }

    let child = Command::new(&python)
        .arg(&server_script)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start Kokoro: {e}"))?;

    println!("[ReHero] Kokoro TTS server started (pid {})", child.id());
    *guard = Some(child);
    Ok("started".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(KokoroServer {
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![start_kokoro])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
