import { create } from 'zustand';
import { DEFAULT_DASHBOARD_SECTIONS } from './layout';
import type { UserPreferences } from './types';

const DEFAULT_PREFERENCES: UserPreferences = {
  version: 1,
  dashboardSections: DEFAULT_DASHBOARD_SECTIONS.map((s) => ({ ...s })),
};

interface PreferencesState {
  preferences: UserPreferences;
  loaded: boolean;
  setPreferences: (preferences: UserPreferences) => void;
  reset: () => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  preferences: DEFAULT_PREFERENCES,
  loaded: false,
  setPreferences: (preferences) => set({ preferences, loaded: true }),
  reset: () => set({ preferences: DEFAULT_PREFERENCES, loaded: false }),
}));
