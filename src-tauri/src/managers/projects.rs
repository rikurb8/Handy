use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use rusqlite_migration::{Migrations, M};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use specta::Type;
use std::path::PathBuf;
use tauri::AppHandle;

static MIGRATIONS: &[M] = &[
    M::up(
        "CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            archived_at INTEGER
        );",
    ),
    M::up(
        "CREATE TABLE IF NOT EXISTS project_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content_json TEXT NOT NULL,
            is_default BOOLEAN NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        );",
    ),
    M::up(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_project_notes_default_per_project
         ON project_notes(project_id)
         WHERE is_default = 1;",
    ),
];

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ProjectNote {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub content_json: String,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct ProjectsManager {
    db_path: PathBuf,
}

impl ProjectsManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_data_dir = crate::portable::app_data_dir(app_handle)?;
        let manager = Self {
            db_path: app_data_dir.join("projects.db"),
        };
        manager.init_database()?;
        Ok(manager)
    }

    fn init_database(&self) -> Result<()> {
        let mut conn = Connection::open(&self.db_path)?;
        let migrations = Migrations::new(MIGRATIONS.to_vec());

        #[cfg(debug_assertions)]
        migrations.validate().expect("Invalid projects migrations");

        conn.execute("PRAGMA foreign_keys = ON", [])?;
        migrations.to_latest(&mut conn)?;
        Ok(())
    }

    fn get_connection(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        Ok(conn)
    }

    fn map_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
        Ok(Project {
            id: row.get("id")?,
            name: row.get("name")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            archived_at: row.get("archived_at")?,
        })
    }

    fn map_project_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectNote> {
        Ok(ProjectNote {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            title: row.get("title")?,
            content_json: row.get("content_json")?,
            is_default: row.get("is_default")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }

    fn validate_project_name(name: &str) -> Result<String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(anyhow!("Project name cannot be empty"));
        }
        Ok(trimmed.to_string())
    }

    fn default_note_json() -> String {
        "[]".to_string()
    }

    fn create_project_with_conn(conn: &Connection, name: &str) -> Result<Project> {
        let now = Utc::now().timestamp();
        conn.execute(
            "INSERT INTO projects (name, created_at, updated_at, archived_at)
             VALUES (?1, ?2, ?3, NULL)",
            params![name, now, now],
        )?;
        let project_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO project_notes
                (project_id, title, content_json, is_default, created_at, updated_at)
             VALUES (?1, ?2, ?3, 1, ?4, ?5)",
            params![project_id, "Notes", Self::default_note_json(), now, now],
        )?;

        conn.query_row(
            "SELECT id, name, created_at, updated_at, archived_at
             FROM projects WHERE id = ?1",
            params![project_id],
            Self::map_project,
        )
        .map_err(Into::into)
    }

    fn get_default_note_with_conn(
        conn: &Connection,
        project_id: i64,
    ) -> Result<Option<ProjectNote>> {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, title, content_json, is_default, created_at, updated_at
             FROM project_notes
             WHERE project_id = ?1 AND is_default = 1
             LIMIT 1",
        )?;
        let note = stmt
            .query_row(params![project_id], Self::map_project_note)
            .optional()?;
        Ok(note)
    }

    fn update_default_note_content_with_conn(
        conn: &Connection,
        project_id: i64,
        content_json: &str,
    ) -> Result<ProjectNote> {
        let now = Utc::now().timestamp();
        let updated = conn.execute(
            "UPDATE project_notes
             SET content_json = ?1, updated_at = ?2
             WHERE project_id = ?3 AND is_default = 1",
            params![content_json, now, project_id],
        )?;

        if updated == 0 {
            return Err(anyhow!(
                "Default project note not found for project {}",
                project_id
            ));
        }

        Self::get_default_note_with_conn(conn, project_id)?
            .ok_or_else(|| anyhow!("Failed to load updated default note"))
    }

    fn create_paragraph_block(text: &str) -> Value {
        json!({
            "type": "paragraph",
            "content": [{
                "type": "text",
                "text": text,
                "styles": {}
            }]
        })
    }

    fn append_text_to_default_note_with_conn(
        conn: &Connection,
        project_id: i64,
        text: &str,
    ) -> Result<ProjectNote> {
        let note = Self::get_default_note_with_conn(conn, project_id)?
            .ok_or_else(|| anyhow!("Default project note not found for project {}", project_id))?;

        let mut blocks: Vec<Value> = serde_json::from_str(&note.content_json)
            .map_err(|e| anyhow!("Invalid note content JSON: {}", e))?;

        blocks.push(Self::create_paragraph_block(text));
        let next_json = serde_json::to_string(&blocks)?;

        Self::update_default_note_content_with_conn(conn, project_id, &next_json)
    }

    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, created_at, updated_at, archived_at
             FROM projects
             WHERE archived_at IS NULL
             ORDER BY updated_at DESC, id DESC",
        )?;
        let projects = stmt
            .query_map([], Self::map_project)?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(projects)
    }

    pub fn create_project(&self, name: &str) -> Result<Project> {
        let normalized_name = Self::validate_project_name(name)?;
        let conn = self.get_connection()?;
        Self::create_project_with_conn(&conn, &normalized_name)
    }

    pub fn rename_project(&self, id: i64, name: &str) -> Result<Project> {
        let normalized_name = Self::validate_project_name(name)?;
        let conn = self.get_connection()?;
        let now = Utc::now().timestamp();
        let updated = conn.execute(
            "UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![normalized_name, now, id],
        )?;
        if updated == 0 {
            return Err(anyhow!("Project {} not found", id));
        }

        conn.query_row(
            "SELECT id, name, created_at, updated_at, archived_at FROM projects WHERE id = ?1",
            params![id],
            Self::map_project,
        )
        .map_err(Into::into)
    }

    pub fn delete_project(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;
        let deleted = conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        if deleted == 0 {
            return Err(anyhow!("Project {} not found", id));
        }
        Ok(())
    }

    pub fn get_default_note(&self, project_id: i64) -> Result<Option<ProjectNote>> {
        let conn = self.get_connection()?;
        Self::get_default_note_with_conn(&conn, project_id)
    }

    pub fn update_default_note_content(
        &self,
        project_id: i64,
        content_json: String,
    ) -> Result<ProjectNote> {
        let conn = self.get_connection()?;
        Self::update_default_note_content_with_conn(&conn, project_id, &content_json)
    }

    pub fn append_text_to_default_note(&self, project_id: i64, text: &str) -> Result<ProjectNote> {
        if text.trim().is_empty() {
            return Err(anyhow!("Cannot append empty text to note"));
        }
        let conn = self.get_connection()?;
        Self::append_text_to_default_note_with_conn(&conn, project_id, text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_conn() -> Connection {
        let mut conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute("PRAGMA foreign_keys = ON", [])
            .expect("enable foreign keys");
        let migrations = Migrations::new(MIGRATIONS.to_vec());
        migrations.to_latest(&mut conn).expect("run migrations");
        conn
    }

    #[test]
    fn projects_manager_create_and_list_project() {
        let conn = setup_conn();
        ProjectsManager::create_project_with_conn(&conn, "My Project").expect("create project");

        let mut stmt = conn
            .prepare(
                "SELECT id, name, created_at, updated_at, archived_at
                 FROM projects ORDER BY id DESC",
            )
            .expect("prepare project list");
        let projects = stmt
            .query_map([], ProjectsManager::map_project)
            .expect("query projects")
            .collect::<std::result::Result<Vec<_>, _>>()
            .expect("collect projects");

        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].name, "My Project");
    }

    #[test]
    fn projects_manager_creates_default_note_on_project_creation() {
        let conn = setup_conn();
        let project = ProjectsManager::create_project_with_conn(&conn, "Default Note Project")
            .expect("create project");

        let note = ProjectsManager::get_default_note_with_conn(&conn, project.id)
            .expect("get default note")
            .expect("default note exists");

        assert_eq!(note.project_id, project.id);
        assert!(note.is_default);
        assert_eq!(note.content_json, "[]");
    }

    #[test]
    fn projects_manager_updates_default_note_content() {
        let conn = setup_conn();
        let project = ProjectsManager::create_project_with_conn(&conn, "Update Note Project")
            .expect("create project");

        let updated = ProjectsManager::update_default_note_content_with_conn(
            &conn,
            project.id,
            r#"[{"type":"paragraph","content":[]}]"#,
        )
        .expect("update default note");

        assert_eq!(
            updated.content_json,
            r#"[{"type":"paragraph","content":[]}]"#
        );
    }

    #[test]
    fn projects_manager_appends_text_to_default_note() {
        let conn = setup_conn();
        let project = ProjectsManager::create_project_with_conn(&conn, "Append Note Project")
            .expect("create project");

        let updated = ProjectsManager::append_text_to_default_note_with_conn(
            &conn,
            project.id,
            "Hello world",
        )
        .expect("append text");

        let content: Vec<Value> =
            serde_json::from_str(&updated.content_json).expect("parse updated json");
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["type"], "paragraph");
        assert_eq!(content[0]["content"][0]["text"], "Hello world");
    }

    #[test]
    fn projects_manager_rejects_empty_project_name() {
        let err = ProjectsManager::validate_project_name("   ").expect_err("must fail");
        assert!(err.to_string().contains("cannot be empty"));
    }
}
