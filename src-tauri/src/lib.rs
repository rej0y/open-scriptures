use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{path::BaseDirectory, Manager};

const SCRIPTURES_DB_RESOURCE: &str = "scriptures/church-of-jesus-christ-scriptures.db";

#[derive(Serialize)]
struct ChapterVerse {
    number: i64,
    text: String,
}

#[derive(Serialize)]
struct ScriptureChapter {
    volume: String,
    book: String,
    chapter: i64,
    reference: String,
    verses: Vec<ChapterVerse>,
}

fn scriptures_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_path = app
        .path()
        .resolve(SCRIPTURES_DB_RESOURCE, BaseDirectory::Resource)
        .map_err(|error| format!("Could not resolve scriptures database resource: {error}"))?;

    if resource_path.exists() {
        return Ok(resource_path);
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(SCRIPTURES_DB_RESOURCE);

    if dev_path.exists() {
        Ok(dev_path)
    } else {
        Err(format!(
            "Scriptures database was not found at {}",
            resource_path.display()
        ))
    }
}

#[tauri::command]
fn get_example_chapter(app: tauri::AppHandle) -> Result<ScriptureChapter, String> {
    let db_path = scriptures_db_path(&app)?;
    let connection = Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Could not open scriptures database: {error}"))?;

    let mut chapter = connection
        .query_row(
            "
            select volume_title, book_title, chapter_number
            from scriptures
            where book_title = '1 Nephi' and chapter_number = 1
            limit 1
            ",
            [],
            |row| {
                let volume: String = row.get(0)?;
                let book: String = row.get(1)?;
                let chapter: i64 = row.get(2)?;

                Ok(ScriptureChapter {
                    reference: format!("{book} {chapter}"),
                    volume,
                    book,
                    chapter,
                    verses: Vec::new(),
                })
            },
        )
        .map_err(|error| format!("Could not load example chapter: {error}"))?;

    let mut statement = connection
        .prepare(
            "
            select verse_number, scripture_text
            from scriptures
            where book_title = '1 Nephi' and chapter_number = 1
            order by verse_number
            ",
        )
        .map_err(|error| format!("Could not prepare verse query: {error}"))?;

    let verses = statement
        .query_map([], |row| {
            Ok(ChapterVerse {
                number: row.get(0)?,
                text: row.get(1)?,
            })
        })
        .map_err(|error| format!("Could not query verses: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read verses: {error}"))?;

    chapter.verses = verses;
    Ok(chapter)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_example_chapter])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
