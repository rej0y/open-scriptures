use crate::storage::{
    open_scriptures_connection, ChapterVerse, ScriptureBook, ScriptureChapter,
    ScriptureSearchResult,
};
use tracing::{error, info};

fn log_command_error(context: &str, error: impl std::fmt::Display) -> String {
    let message = format!("{context}: {error}");
    error!(%context, error = %error, "{message}");
    message
}

#[tauri::command]
pub(crate) fn list_books(app: tauri::AppHandle) -> Result<Vec<ScriptureBook>, String> {
    info!("listing books");
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
        .map_err(|error| log_command_error("Could not prepare books query", error))?;

    let books = statement
        .query_map([], |row| {
            Ok(ScriptureBook {
                title: row.get(0)?,
                volume: row.get(1)?,
                chapter_count: row.get(2)?,
            })
        })
        .map_err(|error| log_command_error("Could not query books", error))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| log_command_error("Could not read books", error))?;

    Ok(books)
}

#[tauri::command]
pub(crate) fn get_chapter(
    app: tauri::AppHandle,
    book: String,
    chapter_number: i64,
) -> Result<ScriptureChapter, String> {
    info!(book = %book, chapter = chapter_number, "loading chapter");
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
        .map_err(|error| log_command_error("Could not load chapter", error))?;

    let mut statement = connection
        .prepare(
            "
            select verse_number, scripture_text
            from scriptures
            where book_title = ?1 and chapter_number = ?2
            order by verse_number
            ",
        )
        .map_err(|error| log_command_error("Could not prepare verse query", error))?;

    let verses = statement
        .query_map((&book, chapter_number), |row| {
            Ok(ChapterVerse {
                number: row.get(0)?,
                text: row.get(1)?,
            })
        })
        .map_err(|error| log_command_error("Could not query verses", error))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| log_command_error("Could not read verses", error))?;

    chapter.previous_chapter = (chapter.chapter > 1).then_some(chapter.chapter - 1);
    chapter.next_chapter = (chapter.chapter < chapter_count).then_some(chapter.chapter + 1);
    chapter.verses = verses;
    Ok(chapter)
}

#[tauri::command]
pub(crate) fn search_scriptures(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<ScriptureSearchResult>, String> {
    let trimmed_query = query.trim();

    if trimmed_query.len() < 2 {
        return Ok(Vec::new());
    }

    info!(query_len = trimmed_query.len(), "searching scriptures");
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
        .map_err(|error| log_command_error("Could not prepare scripture search query", error))?;

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
        .map_err(|error| log_command_error("Could not query scripture search results", error))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| log_command_error("Could not read scripture search results", error))?;

    Ok(results)
}
