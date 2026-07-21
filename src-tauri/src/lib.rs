mod commands;
mod logging;
mod storage;

use commands::{
    get_chapter, get_topical_guide_topic, get_topical_guide_topic_by_title, list_bookmarks,
    list_books, list_saved_words, remove_bookmark, remove_saved_word, save_bookmark, save_word,
    search_scriptures,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            logging::init_logging(&app.handle())?;
            tracing::info!("application startup complete");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_books,
            get_chapter,
            get_topical_guide_topic,
            get_topical_guide_topic_by_title,
            search_scriptures,
            list_bookmarks,
            list_saved_words,
            save_bookmark,
            save_word,
            remove_saved_word,
            remove_bookmark
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
