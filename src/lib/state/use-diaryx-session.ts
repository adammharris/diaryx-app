import { useContextProvider, useStore, useContext } from "@builder.io/qwik";
import { DiaryxSessionContext, type DiaryxSessionState } from "./diaryx-context";
import { createWelcomeNote } from "../diaryx/sample";

const createInitialState = (): DiaryxSessionState => {
  const initialNote = createWelcomeNote();
  return {
    notes: [initialNote],
    activeNoteId: initialNote.id,
    filters: {
      query: "",
      tag: undefined,
    },
  ui: {
    theme: "system",
    accent: "violet",
    leftPanelWidth: 260,
    rightPanelWidth: 300,
    showLibrary: true,
    showMetadata: true,
    showPreview: true,
    showCommandPalette: false,
    editorMode: "split",
    showSettings: false,
  },
  importState: {
    isImporting: false,
    lastError: undefined,
  },
  exportState: {
    isExporting: false,
    lastSuccessAt: undefined,
  },
  };
};

export const useDiaryxSessionProvider = () => {
  const store = useStore<DiaryxSessionState>(createInitialState());
  useContextProvider(DiaryxSessionContext, store);
  return store;
};

export const useDiaryxSession = () => {
  const store = useContext(DiaryxSessionContext);
  if (!store) {
    throw new Error("Diaryx session context not available");
  }
  return store;
};
