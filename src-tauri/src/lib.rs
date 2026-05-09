use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{path::BaseDirectory, Manager};

const SCRIPTURES_DB_RESOURCE: &str = "scriptures/church-of-jesus-christ-scriptures.db";
const USER_DATA_DB_FILE: &str = "open-scriptures-study.db";

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

#[derive(Serialize)]
struct ScriptureSearchResult {
    volume: String,
    book: String,
    chapter: i64,
    verse: i64,
    reference: String,
    text: String,
}

#[derive(Serialize)]
struct SavedWord {
    id: i64,
    selection_id: String,
    volume: String,
    book: String,
    chapter: i64,
    verse: i64,
    reference: String,
    selected_text: String,
    verse_text: String,
    start_offset: i64,
    end_offset: i64,
    created_at: String,
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

fn user_data_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;

    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    Ok(data_dir.join(USER_DATA_DB_FILE))
}

fn open_user_data_connection(app: &tauri::AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(user_data_db_path(app)?)
        .map_err(|error| format!("Could not open study data database: {error}"))?;

    connection
        .execute_batch(
            "
            create table if not exists saved_words (
              id integer primary key autoincrement,
              selection_id text not null default '',
              volume text not null,
              book text not null,
              chapter integer not null,
              verse integer not null,
              selected_text text not null,
              verse_text text not null,
              start_offset integer not null,
              end_offset integer not null,
              created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
              unique(selection_id, book, chapter, verse, start_offset, end_offset, selected_text)
            );
            ",
        )
        .map_err(|error| format!("Could not prepare study data database: {error}"))?;

    ensure_saved_words_column(
        &connection,
        "selection_id",
        "alter table saved_words add column selection_id text not null default ''",
    )?;
    ensure_saved_words_column(
        &connection,
        "start_offset",
        "alter table saved_words add column start_offset integer not null default 0",
    )?;
    ensure_saved_words_column(
        &connection,
        "end_offset",
        "alter table saved_words add column end_offset integer not null default 0",
    )?;

    Ok(connection)
}

fn ensure_saved_words_column(
    connection: &Connection,
    column_name: &str,
    migration: &str,
) -> Result<(), String> {
    let mut statement = connection
        .prepare("pragma table_info(saved_words)")
        .map_err(|error| format!("Could not inspect saved words table: {error}"))?;
    let has_column = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("Could not inspect saved words columns: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read saved words columns: {error}"))?
        .iter()
        .any(|existing_column| existing_column == column_name);

    if !has_column {
        connection
            .execute(migration, [])
            .map_err(|error| format!("Could not migrate saved words table: {error}"))?;
    }

    Ok(())
}

fn row_to_saved_word(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedWord> {
    let id = row.get(0)?;
    let selection_id = row.get(1)?;
    let volume = row.get(2)?;
    let book: String = row.get(3)?;
    let chapter: i64 = row.get(4)?;
    let verse: i64 = row.get(5)?;
    let selected_text = row.get(6)?;
    let verse_text = row.get(7)?;
    let start_offset = row.get(8)?;
    let end_offset = row.get(9)?;
    let created_at = row.get(10)?;

    Ok(SavedWord {
        id,
        selection_id,
        volume,
        reference: format!("{book} {chapter}:{verse}"),
        book,
        chapter,
        verse,
        selected_text,
        verse_text,
        start_offset,
        end_offset,
        created_at,
    })
}

fn byte_index_for_char_offset(text: &str, offset: i64) -> Option<usize> {
    let target = usize::try_from(offset).ok()?;

    if target == text.chars().count() {
        return Some(text.len());
    }

    text.char_indices().map(|(index, _)| index).nth(target)
}

fn text_for_char_range(text: &str, start_offset: i64, end_offset: i64) -> Option<&str> {
    if start_offset < 0 || end_offset <= start_offset {
        return None;
    }

    let start = byte_index_for_char_offset(text, start_offset)?;
    let end = byte_index_for_char_offset(text, end_offset)?;
    text.get(start..end)
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

#[tauri::command]
fn search_scriptures(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<ScriptureSearchResult>, String> {
    let trimmed_query = query.trim();

    if trimmed_query.len() < 2 {
        return Ok(Vec::new());
    }

    let connection = open_scriptures_connection(&app)?;
    let search_term = format!("%{}%", trimmed_query.to_lowercase());
    let mut statement = connection
        .prepare(
            "
            select
              volume_title,
              book_title,
              chapter_number,
              verse_number,
              scripture_text
            from scriptures
            where lower(scripture_text) like ?1
            order by volume_id, book_id, chapter_number, verse_number
            limit 50
            ",
        )
        .map_err(|error| format!("Could not prepare scripture search query: {error}"))?;

    let results = statement
        .query_map([search_term], |row| {
            let volume: String = row.get(0)?;
            let book: String = row.get(1)?;
            let chapter: i64 = row.get(2)?;
            let verse: i64 = row.get(3)?;
            let text: String = row.get(4)?;

            Ok(ScriptureSearchResult {
                reference: format!("{book} {chapter}:{verse}"),
                volume,
                book,
                chapter,
                verse,
                text,
            })
        })
        .map_err(|error| format!("Could not query scripture search results: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read scripture search results: {error}"))?;

    Ok(results)
}

#[tauri::command]
fn list_saved_words(app: tauri::AppHandle) -> Result<Vec<SavedWord>, String> {
    let connection = open_user_data_connection(&app)?;
    let mut statement = connection
        .prepare(
            "
            select
              id,
              selection_id,
              volume,
              book,
              chapter,
              verse,
              selected_text,
              verse_text,
              start_offset,
              end_offset,
              created_at
            from saved_words
            order by created_at desc, id desc
            ",
        )
        .map_err(|error| format!("Could not prepare saved words query: {error}"))?;

    let saved_words = statement
        .query_map([], row_to_saved_word)
        .map_err(|error| format!("Could not query saved words: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("Could not read saved words: {error}"))?;

    Ok(saved_words)
}

#[tauri::command]
fn save_word(
    app: tauri::AppHandle,
    book: String,
    chapter: i64,
    verse: i64,
    selection_id: String,
    selected_text: String,
    start_offset: i64,
    end_offset: i64,
) -> Result<SavedWord, String> {
    let selected_text = selected_text.trim();

    if selected_text.is_empty() {
        return Err("Select words in a verse before saving.".to_string());
    }

    let scriptures_connection = open_scriptures_connection(&app)?;
    let (volume, verse_text): (String, String) = scriptures_connection
        .query_row(
            "
            select volume_title, scripture_text
            from scriptures
            where book_title = ?1 and chapter_number = ?2 and verse_number = ?3
            limit 1
            ",
            (&book, chapter, verse),
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| format!("Could not load verse to save: {error}"))?;

    if text_for_char_range(&verse_text, start_offset, end_offset)
        .map(str::trim)
        != Some(selected_text)
    {
        return Err("Saved words must come from the selected verse.".to_string());
    }

    let connection = open_user_data_connection(&app)?;

    if let Ok(existing_word) = connection.query_row(
        "
        select
          id,
          selection_id,
          volume,
          book,
          chapter,
          verse,
          selected_text,
          verse_text,
          start_offset,
          end_offset,
          created_at
        from saved_words
        where
          book = ?1 and
          chapter = ?2 and
          verse = ?3 and
          start_offset = ?4 and
          end_offset = ?5 and
          selected_text = ?6
        order by id desc
        limit 1
        ",
        (&book, chapter, verse, start_offset, end_offset, selected_text),
        row_to_saved_word,
    ) {
        return Ok(existing_word);
    }

    connection
        .execute(
            "
            insert or ignore into saved_words (
              selection_id,
              volume,
              book,
              chapter,
              verse,
              selected_text,
              verse_text,
              start_offset,
              end_offset
            )
            values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ",
            params![
                selection_id,
                volume,
                book,
                chapter,
                verse,
                selected_text,
                verse_text,
                start_offset,
                end_offset
            ],
        )
        .map_err(|error| format!("Could not save words: {error}"))?;

    connection
        .query_row(
            "
            select
              id,
              selection_id,
              volume,
              book,
              chapter,
              verse,
              selected_text,
              verse_text,
              start_offset,
              end_offset,
              created_at
            from saved_words
            where
              book = ?2 and
              chapter = ?3 and
              verse = ?4 and
              start_offset = ?5 and
              end_offset = ?6 and
              selected_text = ?7 and
              (selection_id = ?1 or selection_id = '')
            order by selection_id = ?1 desc
            limit 1
            ",
            (
                &selection_id,
                &book,
                chapter,
                verse,
                start_offset,
                end_offset,
                selected_text,
            ),
            row_to_saved_word,
        )
        .map_err(|error| format!("Could not read saved words: {error}"))
}

#[tauri::command]
fn remove_saved_word(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let connection = open_user_data_connection(&app)?;
    let matching_highlight = connection.query_row(
        "
        select book, chapter, verse, selected_text, start_offset, end_offset
        from saved_words
        where id = ?1
        ",
        [id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        },
    );

    if let Ok((book, chapter, verse, selected_text, start_offset, end_offset)) = matching_highlight
    {
        connection
            .execute(
                "
                delete from saved_words
                where
                  book = ?1 and
                  chapter = ?2 and
                  verse = ?3 and
                  selected_text = ?4 and
                  start_offset = ?5 and
                  end_offset = ?6
                ",
                (book, chapter, verse, selected_text, start_offset, end_offset),
            )
            .map_err(|error| format!("Could not remove saved words: {error}"))?;

        return Ok(());
    }

    connection
        .execute("delete from saved_words where id = ?1", [id])
        .map_err(|error| format!("Could not remove saved words: {error}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_books,
            get_chapter,
            search_scriptures,
            list_saved_words,
            save_word,
            remove_saved_word
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
