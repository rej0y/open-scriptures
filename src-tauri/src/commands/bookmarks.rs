use crate::storage::{open_user_data_connection, row_to_bookmark, ChapterBookmark};
use tracing::{error, info};

fn log_command_error(context: &str, error: impl std::fmt::Display) -> String {
    let message = format!("{context}: {error}");
    error!(%context, error = %error, "{message}");
    message
}

#[tauri::command]
pub(crate) fn list_bookmarks(app: tauri::AppHandle) -> Result<Vec<ChapterBookmark>, String> {
    info!("listing bookmarks");
    let connection = open_user_data_connection(&app)?;
    let mut statement = connection
        .prepare(
            "
            select
              id,
              title,
              volume,
              book,
              chapter,
              reference,
              created_at
            from bookmarks
            order by created_at desc, id desc
            ",
        )
        .map_err(|error| log_command_error("Could not prepare bookmarks query", error))?;

    let mut bookmarks = Vec::new();
    let rows = statement
        .query_map([], row_to_bookmark)
        .map_err(|error| log_command_error("Could not query bookmarks", error))?;

    for row in rows {
        bookmarks.push(row.map_err(|error| log_command_error("Could not read bookmarks", error))?);
    }

    Ok(bookmarks)
}

#[tauri::command]
pub(crate) fn save_bookmark(
    app: tauri::AppHandle,
    title: String,
    volume: String,
    book: String,
    chapter: i64,
) -> Result<ChapterBookmark, String> {
    let title = match title.trim() {
        "" => return Err("Enter a bookmark title before saving.".to_string()),
        trimmed => trimmed.to_string(),
    };

    let reference = format!("{book} {chapter}");
    info!(title = %title, book = %book, chapter = chapter, "saving bookmark");

    let connection = open_user_data_connection(&app)?;

    if let Ok(existing_bookmark) = connection.query_row(
        "
        select
          id,
          title,
          volume,
          book,
          chapter,
          reference,
          created_at
        from bookmarks
        where title = ?1 and book = ?2 and chapter = ?3
        limit 1
        ",
        (&title, &book, chapter),
        row_to_bookmark,
    ) {
        return Ok(existing_bookmark);
    }

    connection
        .execute(
            "
            insert or ignore into bookmarks (
              title,
              volume,
              book,
              chapter,
              reference
            )
            values (?1, ?2, ?3, ?4, ?5)
            ",
            (&title, &volume, &book, chapter, &reference),
        )
        .map_err(|error| log_command_error("Could not save bookmark", error))?;

    connection
        .query_row(
            "
            select
              id,
              title,
              volume,
              book,
              chapter,
              reference,
              created_at
            from bookmarks
            where title = ?1 and book = ?2 and chapter = ?3
            limit 1
            ",
            (&title, &book, chapter),
            row_to_bookmark,
        )
        .map_err(|error| log_command_error("Could not read bookmark", error))
}

#[tauri::command]
pub(crate) fn remove_bookmark(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    info!(id = id, "removing bookmark");
    let connection = open_user_data_connection(&app)?;
    connection
        .execute("delete from bookmarks where id = ?1", [id])
        .map_err(|error| log_command_error("Could not remove bookmark", error))?;

    Ok(())
}
