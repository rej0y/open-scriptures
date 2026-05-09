use crate::storage::{
    open_scriptures_connection, open_user_data_connection, row_to_saved_word, text_for_char_range,
    SavedWord,
};
use rusqlite::params;
use tracing::{error, info};

fn log_command_error(context: &str, error: impl std::fmt::Display) -> String {
    let message = format!("{context}: {error}");
    error!(%context, error = %error, "{message}");
    message
}

#[tauri::command]
pub(crate) fn list_saved_words(app: tauri::AppHandle) -> Result<Vec<SavedWord>, String> {
    info!("listing saved words");
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
        .map_err(|error| log_command_error("Could not prepare saved words query", error))?;

    let saved_words = statement
        .query_map([], row_to_saved_word)
        .map_err(|error| log_command_error("Could not query saved words", error))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| log_command_error("Could not read saved words", error))?;

    Ok(saved_words)
}

#[tauri::command]
pub(crate) fn save_word(
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

    info!(
        book = %book,
        chapter = chapter,
        verse = verse,
        selection_id = %selection_id,
        selection_len = selected_text.chars().count(),
        "saving word selection"
    );

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
        .map_err(|error| log_command_error("Could not load verse to save", error))?;

    if text_for_char_range(&verse_text, start_offset, end_offset).map(str::trim)
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
        (
            &book,
            chapter,
            verse,
            start_offset,
            end_offset,
            selected_text,
        ),
        row_to_saved_word,
    ) {
        info!("returning existing saved word");
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
        .map_err(|error| log_command_error("Could not save words", error))?;

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
        .map_err(|error| log_command_error("Could not read saved words", error))
}

#[tauri::command]
pub(crate) fn remove_saved_word(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    info!(id = id, "removing saved word");
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
        info!(
            book = %book,
            chapter = chapter,
            verse = verse,
            "removing saved word group"
        );
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
                (
                    book,
                    chapter,
                    verse,
                    selected_text,
                    start_offset,
                    end_offset,
                ),
            )
            .map_err(|error| log_command_error("Could not remove saved words", error))?;

        return Ok(());
    }

    connection
        .execute("delete from saved_words where id = ?1", [id])
        .map_err(|error| log_command_error("Could not remove saved words", error))?;

    Ok(())
}
