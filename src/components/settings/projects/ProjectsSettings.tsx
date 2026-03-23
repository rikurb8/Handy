import React, { useEffect, useMemo, useState } from "react";
import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/ariakit";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { useProjectsStore } from "@/stores/projectsStore";

const parseInitialContent = (contentJson: string | null): PartialBlock[] => {
  if (!contentJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(contentJson);
    return Array.isArray(parsed) ? (parsed as PartialBlock[]) : [];
  } catch {
    return [];
  }
};

export const ProjectsSettings: React.FC = () => {
  const { t } = useTranslation();
  const {
    projects,
    selectedProjectId,
    currentNote,
    isLoading,
    isSaving,
    saveError,
    initialize,
    createProject,
    renameProject,
    deleteProject,
    selectProject,
    saveCurrentNoteDebounced,
    appendLatestTranscript,
  } = useProjectsStore();

  const [newProjectName, setNewProjectName] = useState("");
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [editorSeed, setEditorSeed] = useState(0);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    setProjectNameDraft(selectedProject?.name ?? "");
  }, [selectedProject?.id, selectedProject?.name]);

  const initialContent = useMemo(
    () => parseInitialContent(currentNote?.content_json ?? null),
    [currentNote?.id, editorSeed],
  );

  const editor = useCreateBlockNote(
    {
      initialContent,
    },
    [currentNote?.id, editorSeed],
  );

  const handleCreateProject = async () => {
    const project = await createProject(newProjectName);
    if (project) {
      setNewProjectName("");
      setEditorSeed((seed) => seed + 1);
    }
  };

  const handleRenameProject = async () => {
    if (!selectedProject) {
      return;
    }

    const result = await renameProject(selectedProject.id, projectNameDraft);
    if (!result) {
      toast.error(t("settings.projects.renameError"));
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    const didDelete = await deleteProject(projectId);
    if (!didDelete) {
      toast.error(t("settings.projects.deleteError"));
    }
  };

  const handleAppendLatestTranscript = async () => {
    try {
      await appendLatestTranscript();
      setEditorSeed((seed) => seed + 1);
      toast.success(t("settings.projects.appendSuccess"));
    } catch (error) {
      console.error("Failed to append latest transcript:", error);
      toast.error(t("settings.projects.appendError"));
    }
  };

  return (
    <div className="w-full max-w-6xl h-[70vh] border border-mid-gray/20 rounded-xl overflow-hidden bg-background">
      <div className="h-full grid grid-cols-[260px_1fr]">
        <div className="border-r border-mid-gray/20 bg-mid-gray/5 p-3 flex flex-col gap-3">
          <div className="space-y-1">
            <h2 className="text-xs font-medium text-mid-gray uppercase tracking-wide">
              {t("settings.projects.title")}
            </h2>
            <p className="text-xs text-mid-gray">
              {t("settings.projects.description")}
            </p>
          </div>

          <div className="flex gap-2">
            <input
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder={t("settings.projects.newProjectPlaceholder")}
              className="w-full bg-background border border-mid-gray/30 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-logo-primary"
            />
            <Button
              variant="primary-soft"
              size="sm"
              onClick={handleCreateProject}
              disabled={!newProjectName.trim()}
              title={t("settings.projects.create")}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="overflow-y-auto flex-1 space-y-1">
            {projects.map((project) => {
              const isActive = project.id === selectedProjectId;
              return (
                <div
                  key={project.id}
                  className={`group flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors ${
                    isActive
                      ? "border-logo-primary/60 bg-logo-primary/10"
                      : "border-mid-gray/20 hover:border-logo-primary/30"
                  }`}
                >
                  <button
                    className="text-sm flex-1 truncate text-left cursor-pointer"
                    onClick={() => {
                      selectProject(project.id);
                      setEditorSeed((seed) => seed + 1);
                    }}
                    title={project.name}
                  >
                    {project.name}
                  </button>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity cursor-pointer"
                    onClick={() => handleDeleteProject(project.id)}
                    title={t("settings.projects.delete")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            {!isLoading && projects.length === 0 && (
              <p className="text-xs text-mid-gray px-1 py-2">
                {t("settings.projects.empty")}
              </p>
            )}
          </div>
        </div>

        <div className="p-3 flex flex-col gap-3 min-w-0">
          {selectedProject && currentNote ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  className="w-full bg-background border border-mid-gray/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-logo-primary"
                  aria-label={t("settings.projects.projectName")}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRenameProject}
                  disabled={!projectNameDraft.trim()}
                >
                  {t("settings.projects.rename")}
                </Button>
                <Button
                  variant="primary-soft"
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={handleAppendLatestTranscript}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{t("settings.projects.insertLatestTranscript")}</span>
                </Button>
              </div>

              <div className="text-xs text-mid-gray h-4">
                {isSaving
                  ? t("settings.projects.saving")
                  : saveError
                    ? t("settings.projects.saveError")
                    : t("settings.projects.saved")}
              </div>

              <div className="flex-1 min-h-0 rounded-lg border border-mid-gray/20 overflow-auto">
                <BlockNoteView
                  editor={editor}
                  onChange={() => {
                    const contentJson = JSON.stringify(editor.document);
                    saveCurrentNoteDebounced(contentJson);
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-mid-gray">
              {isLoading
                ? t("settings.projects.loading")
                : t("settings.projects.selectProject")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
