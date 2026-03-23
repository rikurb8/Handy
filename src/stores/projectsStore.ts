import { create } from "zustand";
import { commands, type Project, type ProjectNote } from "@/bindings";

const AUTOSAVE_DELAY_MS = 700;

interface ProjectsStore {
  projects: Project[];
  selectedProjectId: number | null;
  currentNote: ProjectNote | null;
  isLoading: boolean;
  isSaving: boolean;
  saveError: string | null;
  saveCurrentNoteDebouncedTimer: ReturnType<typeof setTimeout> | null;

  initialize: () => Promise<void>;
  createProject: (name: string) => Promise<Project | null>;
  renameProject: (projectId: number, name: string) => Promise<Project | null>;
  deleteProject: (projectId: number) => Promise<boolean>;
  selectProject: (projectId: number) => Promise<void>;
  setCurrentNoteContent: (contentJson: string) => void;
  saveCurrentNote: (contentJson?: string) => Promise<void>;
  saveCurrentNoteDebounced: (contentJson: string) => void;
  appendLatestTranscript: () => Promise<ProjectNote>;
}

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  currentNote: null,
  isLoading: false,
  isSaving: false,
  saveError: null,
  saveCurrentNoteDebouncedTimer: null,

  initialize: async () => {
    set({ isLoading: true, saveError: null });
    try {
      const result = await commands.listProjects();
      if (result.status === "error") {
        throw new Error(String(result.error));
      }

      const projects = result.data;
      set({ projects, isLoading: false });

      if (projects.length > 0) {
        await get().selectProject(projects[0].id);
      } else {
        set({ selectedProjectId: null, currentNote: null });
      }
    } catch (error) {
      console.error("Failed to initialize projects:", error);
      set({ isLoading: false, saveError: String(error) });
    }
  },

  createProject: async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const result = await commands.createProject(trimmed);
      if (result.status === "error") {
        throw new Error(String(result.error));
      }

      const project = result.data;
      set((state) => ({ projects: [project, ...state.projects] }));
      await get().selectProject(project.id);
      return project;
    } catch (error) {
      console.error("Failed to create project:", error);
      return null;
    }
  },

  renameProject: async (projectId: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const result = await commands.renameProject(projectId, trimmed);
      if (result.status === "error") {
        throw new Error(String(result.error));
      }

      const updatedProject = result.data;
      set((state) => ({
        projects: state.projects.map((project) =>
          project.id === projectId ? updatedProject : project,
        ),
      }));
      return updatedProject;
    } catch (error) {
      console.error("Failed to rename project:", error);
      return null;
    }
  },

  deleteProject: async (projectId: number) => {
    try {
      const result = await commands.deleteProject(projectId);
      if (result.status === "error") {
        throw new Error(String(result.error));
      }

      const remainingProjects = get().projects.filter(
        (project) => project.id !== projectId,
      );
      set({ projects: remainingProjects });

      if (get().selectedProjectId === projectId) {
        if (remainingProjects.length > 0) {
          await get().selectProject(remainingProjects[0].id);
        } else {
          set({ selectedProjectId: null, currentNote: null });
        }
      }

      return true;
    } catch (error) {
      console.error("Failed to delete project:", error);
      return false;
    }
  },

  selectProject: async (projectId: number) => {
    set({ selectedProjectId: projectId, isLoading: true, saveError: null });
    try {
      const noteResult = await commands.getProjectDefaultNote(projectId);
      if (noteResult.status === "error") {
        throw new Error(String(noteResult.error));
      }

      set({ currentNote: noteResult.data, isLoading: false });
    } catch (error) {
      console.error("Failed to load project note:", error);
      set({ currentNote: null, isLoading: false, saveError: String(error) });
    }
  },

  setCurrentNoteContent: (contentJson: string) => {
    set((state) => ({
      currentNote: state.currentNote
        ? { ...state.currentNote, content_json: contentJson }
        : null,
    }));
  },

  saveCurrentNote: async (contentJson?: string) => {
    const { selectedProjectId, currentNote } = get();
    if (!selectedProjectId || !currentNote) {
      return;
    }

    const nextContent = contentJson ?? currentNote.content_json;

    set({ isSaving: true, saveError: null });
    try {
      const result = await commands.updateProjectDefaultNoteContent(
        selectedProjectId,
        nextContent,
      );
      if (result.status === "error") {
        throw new Error(String(result.error));
      }

      set({ currentNote: result.data, isSaving: false });
    } catch (error) {
      console.error("Failed to save project note:", error);
      set({ isSaving: false, saveError: String(error) });
    }
  },

  saveCurrentNoteDebounced: (contentJson: string) => {
    const previousTimer = get().saveCurrentNoteDebouncedTimer;
    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    get().setCurrentNoteContent(contentJson);

    const nextTimer = setTimeout(() => {
      get().saveCurrentNote(contentJson);
    }, AUTOSAVE_DELAY_MS);

    set({ saveCurrentNoteDebouncedTimer: nextTimer });
  },

  appendLatestTranscript: async () => {
    const { selectedProjectId } = get();
    if (!selectedProjectId) {
      throw new Error("No project selected");
    }

    const result = await commands.appendLatestTranscriptToProject(
      selectedProjectId,
    );

    if (result.status === "error") {
      throw new Error(String(result.error));
    }

    set({ currentNote: result.data, saveError: null });
    return result.data;
  },
}));
