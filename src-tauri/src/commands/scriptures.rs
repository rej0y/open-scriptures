use crate::storage::{
    open_scriptures_connection, ChapterVerse, ScriptureBook, ScriptureChapter,
    ScriptureSearchResult, TopicalGuideLink,
};
use std::collections::HashMap;
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
            select books.book_title, books.book_short_title, volumes.volume_title,
              count(chapters.id) as chapter_count
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
                short_title: row.get(1)?,
                volume: row.get(2)?,
                chapter_count: row.get(3)?,
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
            select verse_id, verse_number, scripture_text
            from scriptures
            where book_title = ?1 and chapter_number = ?2
            order by verse_number
            ",
        )
        .map_err(|error| log_command_error("Could not prepare verse query", error))?;

    let verse_rows = statement
        .query_map((&book, chapter_number), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| log_command_error("Could not query verses", error))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| log_command_error("Could not read verses", error))?;

    let mut topic_links_by_verse: HashMap<i64, Vec<TopicalGuideLink>> = HashMap::new();
    let mut topic_statement = connection
        .prepare(
            "
            select
              links.verse_id,
              topics.id,
              topics.title,
              links.start_offset,
              links.end_offset
            from verse_topical_guide_links links
            inner join topical_guide_topics topics on topics.id = links.topic_id
            inner join scriptures on scriptures.verse_id = links.verse_id
            where scriptures.book_title = ?1 and scriptures.chapter_number = ?2
            order by links.verse_id, links.start_offset, links.end_offset desc
            ",
        )
        .map_err(|error| log_command_error("Could not prepare topical guide links query", error))?;

    let topic_rows = topic_statement
        .query_map((&book, chapter_number), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                TopicalGuideLink {
                    topic_id: row.get(1)?,
                    title: row.get(2)?,
                    start_offset: row.get(3)?,
                    end_offset: row.get(4)?,
                },
            ))
        })
        .map_err(|error| log_command_error("Could not query topical guide links", error))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| log_command_error("Could not read topical guide links", error))?;

    for (verse_id, topic_link) in topic_rows {
        topic_links_by_verse
            .entry(verse_id)
            .or_default()
            .push(topic_link);
    }

    let verses = verse_rows
        .into_iter()
        .map(|(verse_id, number, text)| ChapterVerse {
            number,
            text,
            topic_links: topic_links_by_verse.remove(&verse_id).unwrap_or_default(),
        })
        .collect();

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
