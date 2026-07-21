use crate::storage::{open_scriptures_connection, TopicalGuideTopic};
use tracing::{error, info};

#[tauri::command]
pub(crate) fn get_topical_guide_topic(
    app: tauri::AppHandle,
    topic_id: i64,
) -> Result<TopicalGuideTopic, String> {
    info!(topic_id, "loading topical guide topic");
    let connection = open_scriptures_connection(&app)?;

    connection
        .query_row(
            "
            select id, title, related_topics, content, source_page
            from topical_guide_topics
            where id = ?1
            ",
            [topic_id],
            |row| {
                Ok(TopicalGuideTopic {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    related_topics: row.get(2)?,
                    content: row.get(3)?,
                    source_page: row.get(4)?,
                })
            },
        )
        .map_err(|query_error| {
            let message = format!("Could not load topical guide topic: {query_error}");
            error!(topic_id, error = %query_error, "{message}");
            message
        })
}

#[tauri::command]
pub(crate) fn get_topical_guide_topic_by_title(
    app: tauri::AppHandle,
    topic_title: String,
) -> Result<TopicalGuideTopic, String> {
    info!(topic_title = %topic_title, "loading topical guide topic by title");
    let connection = open_scriptures_connection(&app)?;

    connection
        .query_row(
            "
            select id, title, related_topics, content, source_page
            from topical_guide_topics
            where title = ?1 collate nocase or normalized_title = lower(trim(?1))
            order by title = ?1 desc
            limit 1
            ",
            [&topic_title],
            |row| {
                Ok(TopicalGuideTopic {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    related_topics: row.get(2)?,
                    content: row.get(3)?,
                    source_page: row.get(4)?,
                })
            },
        )
        .map_err(|query_error| {
            let message =
                format!("Could not load Topical Guide topic ‘{topic_title}’: {query_error}");
            error!(topic_title = %topic_title, error = %query_error, "{message}");
            message
        })
}
