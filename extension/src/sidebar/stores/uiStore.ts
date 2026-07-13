import { create } from 'zustand';

export type PanelMode = 'chat' | 'editor' | 'context';

interface UIState {
  selectedNodeId: string | null;
  panelMode: PanelMode;

  selectNode: (id: string | null) => void;
  setPanelMode: (mode: PanelMode) => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedNodeId: null,
  panelMode: 'chat',

  selectNode: (id) => set({ selectedNodeId: id, panelMode: 'chat' }),
  setPanelMode: (mode) => set({ panelMode: mode }),
}));
