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
    previous_chapter: Option<i64>,
    next_chapter: Option<i64>,
    reference: String,
    verses: Vec<ChapterVerse>,
}

#[derive(Serialize)]
struct ScriptureBook {
    title: String,
    volume: String,
    chapter_count: i64,
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

fn open_scriptures_connection(app: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = scriptures_db_path(app)?;

    Connection::open_with_flags(db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Could not open scriptures database: {error}"))
}

#[tauri::command]
fn list_books(app: tauri::AppHandle) -> Result<Vec<ScriptureBook>, String> {
    let connection = open_scriptures_connection(&app)?;
    let mut statement = connection
        .prepare(
            "
            select books.book_title, volumes.volume_title, count(chapters.id) as chapter_count
            from books
            inner join volumes on volumes.id = books.volume_id
            inner join chapters on chapters.book_id = books.id
            group by books.id
            order by volumes.id, books.id
            ",
        )
        .map_err(|error| format!("Could not prepare books query: {error}"))?;

    let books = statement
        .query_map([], |row| {
            Ok(ScriptureBook {
                title: row.get(0)?,
                volume: row.get(1)?,
                chapter_count: row.get(2)?,
            })
        })
        .map_err(|error| format!("Could not query books: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read books: {error}"))?;

    Ok(books)
}

#[tauri::command]
fn get_chapter(
    app: tauri::AppHandle,
    book: String,
    chapter_number: i64,
) -> Result<ScriptureChapter, String> {
    let connection = open_scriptures_connection(&app)?;

    let (mut chapter, chapter_count) = connection
        .query_row(
            "
            select
              scriptures.volume_title,
              scriptures.book_title,
              scriptures.chapter_number,
              (
                select count(*)
                from chapters
                inner join books on books.id = chapters.book_id
                where books.book_title = scriptures.book_title
              ) as chapter_count
            from scriptures
            where book_title = ?1 and chapter_number = ?2
            limit 1
            ",
            (&book, chapter_number),
            |row| {
                let volume: String = row.get(0)?;
                let book: String = row.get(1)?;
                let chapter: i64 = row.get(2)?;
                let chapter_count: i64 = row.get(3)?;

                Ok((
                    ScriptureChapter {
                        reference: format!("{book} {chapter}"),
                        volume,
                        book,
                        chapter,
                        previous_chapter: None,
                        next_chapter: None,
                        verses: Vec::new(),
                    },
                    chapter_count,
                ))
            },
        )
        .map_err(|error| format!("Could not load chapter: {error}"))?;

    let mut statement = connection
        .prepare(
            "
            select verse_number, scripture_text
            from scriptures
            where book_title = ?1 and chapter_number = ?2
            order by verse_number
            ",
        )
        .map_err(|error| format!("Could not prepare verse query: {error}"))?;

    let verses = statement
        .query_map((&book, chapter_number), |row| {
            Ok(ChapterVerse {
                number: row.get(0)?,
                text: row.get(1)?,
            })
        })
        .map_err(|error| format!("Could not query verses: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read verses: {error}"))?;

    chapter.previous_chapter = (chapter.chapter > 1).then_some(chapter.chapter - 1);
    chapter.next_chapter = (chapter.chapter < chapter_count).then_some(chapter.chapter + 1);
    chapter.verses = verses;
    Ok(chapter)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![list_books, get_chapter])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
