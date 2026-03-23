use crate::managers::{
    history::HistoryManager,
    projects::{Project, ProjectNote, ProjectsManager},
};
use std::sync::Arc;
use tauri::{AppHandle, State};

fn require_non_empty_transcript_text<'a>(latest_text: Option<&'a str>) -> Result<&'a str, String> {
    let text = latest_text
        .ok_or_else(|| "No completed transcript found".to_string())?
        .trim();

    if text.is_empty() {
        return Err("Latest transcript is empty".to_string());
    }

    Ok(text)
}

#[tauri::command]
#[specta::specta]
pub async fn list_projects(
    _app: AppHandle,
    projects_manager: State<'_, Arc<ProjectsManager>>,
) -> Result<Vec<Project>, String> {
    projects_manager.list_projects().map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn create_project(
    _app: AppHandle,
    projects_manager: State<'_, Arc<ProjectsManager>>,
    name: String,
) -> Result<Project, String> {
    projects_manager
        .create_project(&name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn rename_project(
    _app: AppHandle,
    projects_manager: State<'_, Arc<ProjectsManager>>,
    project_id: i64,
    name: String,
) -> Result<Project, String> {
    projects_manager
        .rename_project(project_id, &name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_project(
    _app: AppHandle,
    projects_manager: State<'_, Arc<ProjectsManager>>,
    project_id: i64,
) -> Result<(), String> {
    projects_manager
        .delete_project(project_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn get_project_default_note(
    _app: AppHandle,
    projects_manager: State<'_, Arc<ProjectsManager>>,
    project_id: i64,
) -> Result<ProjectNote, String> {
    projects_manager
        .get_default_note(project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Default note not found for project {}", project_id))
}

#[tauri::command]
#[specta::specta]
pub async fn update_project_default_note_content(
    _app: AppHandle,
    projects_manager: State<'_, Arc<ProjectsManager>>,
    project_id: i64,
    content_json: String,
) -> Result<ProjectNote, String> {
    projects_manager
        .update_default_note_content(project_id, content_json)
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn append_latest_transcript_to_project(
    _app: AppHandle,
    projects_manager: State<'_, Arc<ProjectsManager>>,
    history_manager: State<'_, Arc<HistoryManager>>,
    project_id: i64,
) -> Result<ProjectNote, String> {
    let latest = history_manager
        .get_latest_completed_entry()
        .map_err(|e| e.to_string())?;

    let text = require_non_empty_transcript_text(
        latest
            .as_ref()
            .map(|entry| entry.transcription_text.as_str()),
    )?;

    projects_manager
        .append_text_to_default_note(project_id, text)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::require_non_empty_transcript_text;

    #[test]
    fn require_non_empty_transcript_text_rejects_missing_transcript() {
        let result = require_non_empty_transcript_text(None);
        assert_eq!(result.unwrap_err(), "No completed transcript found");
    }

    #[test]
    fn require_non_empty_transcript_text_rejects_whitespace_only_transcript() {
        let result = require_non_empty_transcript_text(Some("   \n\t "));
        assert_eq!(result.unwrap_err(), "Latest transcript is empty");
    }

    #[test]
    fn require_non_empty_transcript_text_trims_and_returns_text() {
        let result = require_non_empty_transcript_text(Some("  hello world  "));
        assert_eq!(result.unwrap(), "hello world");
    }
}
