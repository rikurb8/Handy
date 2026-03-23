// @ts-nocheck
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { commands, type ProjectNote } from "../src/bindings";
import { useProjectsStore } from "../src/stores/projectsStore";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const baseNote: ProjectNote = {
  id: 11,
  project_id: 5,
  title: "Notes",
  content_json: "[]",
  is_default: true,
  created_at: 1,
  updated_at: 1,
};

const resetStore = () => {
  useProjectsStore.setState({
    projects: [],
    selectedProjectId: null,
    currentNote: null,
    isLoading: false,
    isSaving: false,
    saveError: null,
    saveCurrentNoteDebouncedTimer: null,
  });
};

describe("projectsStore", () => {
  const originalUpdateProjectDefaultNoteContent =
    commands.updateProjectDefaultNoteContent;

  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    const timer = useProjectsStore.getState().saveCurrentNoteDebouncedTimer;
    if (timer) {
      clearTimeout(timer);
    }

    commands.updateProjectDefaultNoteContent =
      originalUpdateProjectDefaultNoteContent;
    resetStore();
  });

  test("saveCurrentNoteDebounced saves only latest content", async () => {
    const calls: Array<{ projectId: number; contentJson: string }> = [];

    commands.updateProjectDefaultNoteContent = async (
      projectId: number,
      contentJson: string,
    ) => {
      calls.push({ projectId, contentJson });
      return {
        status: "ok",
        data: {
          ...baseNote,
          project_id: projectId,
          content_json: contentJson,
        },
      };
    };

    useProjectsStore.setState({
      selectedProjectId: 5,
      currentNote: baseNote,
    });

    useProjectsStore.getState().saveCurrentNoteDebounced('[{"type":"paragraph","content":[{"type":"text","text":"first","styles":{}}]}]');
    await wait(100);
    useProjectsStore.getState().saveCurrentNoteDebounced('[{"type":"paragraph","content":[{"type":"text","text":"second","styles":{}}]}]');

    await wait(850);

    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({
      projectId: 5,
      contentJson:
        '[{"type":"paragraph","content":[{"type":"text","text":"second","styles":{}}]}]',
    });
  });

  test("saveCurrentNote stores error when save fails", async () => {
    commands.updateProjectDefaultNoteContent = async () => ({
      status: "error",
      error: "save exploded",
    });

    useProjectsStore.setState({
      selectedProjectId: 5,
      currentNote: baseNote,
    });

    await useProjectsStore
      .getState()
      .saveCurrentNote('[{"type":"paragraph","content":[]}]');

    const state = useProjectsStore.getState();
    expect(state.isSaving).toBe(false);
    expect(state.saveError).toContain("save exploded");
  });
});
