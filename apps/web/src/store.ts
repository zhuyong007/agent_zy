import { create } from "zustand";

interface ComposerState {
  draft: string;
  setDraft: (value: string) => void;
  resetDraft: () => void;
}

export const useComposerStore = create<ComposerState>((set) => ({
  draft: "",
  setDraft: (value) => set({ draft: value }),
  resetDraft: () => set({ draft: "" })
}));
