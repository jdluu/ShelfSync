import { create } from "zustand";
import type { AppMode } from "@/types/library";

interface AppState {
  role: AppMode;
  setRole: (role: AppMode) => void;
}

export const useAppStore = create<AppState>((set) => ({
  role: "unselected",
  setRole: (role) => set({ role }),
}));
