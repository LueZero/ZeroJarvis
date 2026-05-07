use tauri::Manager;
use tauri::Emitter;
use base64::Engine;
use std::io::Cursor;
use std::fs;
use std::path::PathBuf;

/// Get the files/captures directory (project root)
fn captures_dir() -> PathBuf {
    let dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let captures = dir.join("files").join("captures");
    if !captures.exists() {
        let _ = fs::create_dir_all(&captures);
    }
    captures
}

/// Capture the primary screen and return base64-encoded JPEG
#[tauri::command]
fn capture_screen() -> Result<String, String> {
    let monitors = xcap::Monitor::all().map_err(|e| format!("Failed to list monitors: {}", e))?;
    let monitor = monitors.into_iter().next().ok_or("No monitor found")?;

    let screenshot = monitor.capture_image().map_err(|e| format!("Screenshot failed: {}", e))?;

    // Encode as JPEG with quality 70
    let mut buf = Cursor::new(Vec::new());
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 70);
    screenshot
        .write_with_encoder(encoder)
        .map_err(|e| format!("JPEG encode failed: {}", e))?;

    let jpeg_bytes = buf.into_inner();

    // Save to files/captures/ directory
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let file_path = captures_dir().join(format!("screen_{}.jpg", timestamp));
    let _ = fs::write(&file_path, &jpeg_bytes);

    let b64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);
    Ok(b64)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![capture_screen])
        .setup(|app| {
            // Register global shortcut Ctrl+Space to wake Jarvis
            use tauri_plugin_global_shortcut::GlobalShortcutExt;

            app.global_shortcut().on_shortcut("CmdOrCtrl+Space", |app, _event, _shortcut| {
                if let Some(window) = app.get_webview_window("main") {
                    // Focus window and emit wake event
                    let _ = window.set_focus();
                    let _ = window.emit("jarvis:wake", ());
                }
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
