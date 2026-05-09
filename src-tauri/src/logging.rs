use std::sync::OnceLock;

use tauri::{path::BaseDirectory, Manager};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

static LOG_GUARD: OnceLock<tracing_appender::non_blocking::WorkerGuard> = OnceLock::new();

pub(crate) fn init_logging(app: &tauri::AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .resolve("logs", BaseDirectory::AppData)
        .map_err(|error| format!("Could not resolve log directory: {error}"))?;

    std::fs::create_dir_all(&log_dir)
        .map_err(|error| format!("Could not create log directory: {error}"))?;

    let log_file = log_dir.join("open-scriptures.log");
    let file_appender = tracing_appender::rolling::never(&log_dir, "open-scriptures.log");
    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);
    let _ = LOG_GUARD.set(guard);

    let file_layer = tracing_subscriber::fmt::layer()
        .with_writer(file_writer)
        .with_ansi(false)
        .with_target(false)
        .with_level(true);

    let stderr_layer = tracing_subscriber::fmt::layer()
        .with_writer(std::io::stderr)
        .with_ansi(true)
        .with_target(false)
        .with_level(true);

    tracing_subscriber::registry()
        .with(file_layer)
        .with(stderr_layer)
        .try_init()
        .map_err(|error| format!("Could not initialize runtime logging: {error}"))?;

    tracing::info!(log_file = %log_file.display(), "runtime logging initialized");
    Ok(())
}
