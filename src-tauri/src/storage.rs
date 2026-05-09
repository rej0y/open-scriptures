use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{path::BaseDirectory, Manager};

pub(crate) const SCRIPTURES_DB_RESOURCE: &str = "scriptures/church-of-jesus-christ-scriptures.db";
pub(crate) const USER_DATA_DB_FILE: &str = "open-scriptures-study.db";

#[derive(Serialize)]
pub(crate) struct ChapterVerse {
    pub number: i64,
    pub text: String,
}

#[derive(Serialize)]
pub(crate) struct ScriptureChapter {
    pub volume: String,
    pub book: String,
    pub chapter: i64,
    pub previous_chapter: Option<i64>,
    pub next_chapter: Option<i64>,
    pub reference: String,
    pub verses: Vec<ChapterVerse>,
}

#[derive(Serialize)]
pub(crate) struct ScriptureBook {
    pub title: String,
    pub volume: String,
    pub chapter_count: i64,
}

#[derive(Serialize)]
pub(crate) struct ScriptureSearchResult {
    pub volume: String,
    pub book: String,
    pub chapter: i64,
    pub verse: i64,
    pub reference: String,
    pub text: String,
}

#[derive(Serialize)]
pub(crate) struct SavedWord {
    pub id: i64,
    pub selection_id: String,
    pub volume: String,
    pub book: String,
    pub chapter: i64,
    pub verse: i64,
    pub reference: String,
    pub selected_text: String,
    pub verse_text: String,
    pub start_offset: i64,
    pub end_offset: i64,
    pub created_at: String,
}

#[derive(Serialize)]
pub(crate) struct ChapterBookmark {
    pub id: i64,
    pub title: String,
    pub volume: String,
    pub book: String,
    pub chapter: i64,
    pub reference: String,
    pub created_at: String,
}

pub(crate) fn scriptures_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

pub(crate) fn open_scriptures_connection(app: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = scriptures_db_path(app)?;

    Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Could not open scriptures database: {error}"))
}

pub(crate) fn user_data_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;

    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("Could not create app data directory: {error}"))?;

    Ok(data_dir.join(USER_DATA_DB_FILE))
}

pub(crate) fn open_user_data_connection(app: &tauri::AppHandle) -> Result<Connection, String> {
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
            create table if not exists bookmarks (
              id integer primary key autoincrement,
              title text not null,
              volume text not null,
              book text not null,
              chapter integer not null,
              reference text not null,
              created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
              unique(title, book, chapter)
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

pub(crate) fn row_to_bookmark(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChapterBookmark> {
    Ok(ChapterBookmark {
        id: row.get(0)?,
        title: row.get(1)?,
        volume: row.get(2)?,
        book: row.get(3)?,
        chapter: row.get(4)?,
        reference: row.get(5)?,
        created_at: row.get(6)?,
    })
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

pub(crate) fn row_to_saved_word(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedWord> {
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

pub(crate) fn byte_index_for_char_offset(text: &str, offset: i64) -> Option<usize> {
    let target = usize::try_from(offset).ok()?;

    if target == text.chars().count() {
        return Some(text.len());
    }

    text.char_indices().map(|(index, _)| index).nth(target)
}

pub(crate) fn text_for_char_range(text: &str, start_offset: i64, end_offset: i64) -> Option<&str> {
    if start_offset < 0 || end_offset <= start_offset {
        return None;
    }

    let start = byte_index_for_char_offset(text, start_offset)?;
    let end = byte_index_for_char_offset(text, end_offset)?;
    text.get(start..end)
}

#[cfg(test)]
mod tests {
    use super::{byte_index_for_char_offset, text_for_char_range};

    #[test]
    fn byte_index_counts_unicode_scalars() {
        let text = "aé𝌆";

        assert_eq!(byte_index_for_char_offset(text, 0), Some(0));
        assert_eq!(byte_index_for_char_offset(text, 1), Some(1));
        assert_eq!(byte_index_for_char_offset(text, 2), Some(3));
        assert_eq!(byte_index_for_char_offset(text, 3), Some(text.len()));
    }

    #[test]
    fn text_for_char_range_extracts_valid_slice() {
        let text = "Alma";

        assert_eq!(text_for_char_range(text, 1, 3), Some("lm"));
        assert_eq!(text_for_char_range(text, 3, 3), None);
        assert_eq!(text_for_char_range(text, -1, 2), None);
    }
}
