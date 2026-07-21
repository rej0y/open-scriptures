use crate::storage::{open_scriptures_connection, TopicalGuideTopic};
use rusqlite::{params, OptionalExtension};
use tracing::{error, info};

fn folded_topic_title(title: &str) -> String {
    title
        .chars()
        .filter(|character| {
            !character.is_whitespace() && *character != '-' && *character != '\u{ad}'
        })
        .flat_map(char::to_lowercase)
        .collect()
}

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

    let trimmed_title = topic_title.trim();
    let unprefixed_title = trimmed_title
        .strip_prefix("BD ")
        .or_else(|| trimmed_title.strip_prefix("TG "))
        .unwrap_or(trimmed_title);
    let unqualified_title = unprefixed_title
        .rsplit_once(" [")
        .filter(|(_, qualifier)| qualifier.ends_with(']'))
        .map(|(title, _)| title)
        .unwrap_or(unprefixed_title);
    let short_title = unqualified_title
        .split(',')
        .next()
        .unwrap_or(unqualified_title)
        .trim();
    let mut candidates = vec![
        trimmed_title,
        unprefixed_title,
        unqualified_title,
        short_title,
    ];
    candidates.dedup();

    for candidate in candidates {
        let topic = connection
            .query_row(
                "
            select id, title, related_topics, content, source_page
            from topical_guide_topics
            where title = ?1 collate nocase
               or normalized_title = lower(trim(?1))
               or normalized_title like lower(trim(?1)) || ',%'
               or replace(replace(normalized_title, '-', ''), ' ', '') = ?2
               or replace(replace(normalized_title, '-', ''), ' ', '') like ?2 || ',%'
               or ?2 like replace(replace(normalized_title, '-', ''), ' ', '') || '%'
            order by
              title = ?1 collate nocase desc,
              normalized_title = lower(trim(?1)) desc,
              replace(replace(normalized_title, '-', ''), ' ', '') = ?2 desc,
              abs(length(replace(replace(normalized_title, '-', ''), ' ', '')) - length(?2)),
              length(title)
            limit 1
            ",
                params![candidate, folded_topic_title(candidate)],
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
            .optional()
            .map_err(|query_error| {
                let message =
                    format!("Could not load Topical Guide topic ‘{topic_title}’: {query_error}");
                error!(topic_title = %topic_title, error = %query_error, "{message}");
                message
            })?;

        if let Some(topic) = topic {
            return Ok(topic);
        }
    }

    let message = format!("No matching Topical Guide topic for ‘{topic_title}’");
    error!(topic_title = %topic_title, "{message}");
    Err(message)
}

#[cfg(test)]
mod tests {
    use super::folded_topic_title;

    #[test]
    fn folded_titles_remove_pdf_word_break_artifacts() {
        assert_eq!(
            folded_topic_title("Mys- teries of Godliness"),
            folded_topic_title("Mysteries of Godliness")
        );
        assert_eq!(
            folded_topic_title("Depend- a bility"),
            folded_topic_title("Dependability")
        );
        assert_eq!(
            folded_topic_title("False Doc- trine"),
            folded_topic_title("False Doctrine")
        );
    }

    #[test]
    fn folded_titles_preserve_meaningful_punctuation() {
        assert_ne!(
            folded_topic_title("God, Love of"),
            folded_topic_title("God Love of")
        );
    }
}
