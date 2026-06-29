import { create } from 'zustand';

export type SummaryStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SummaryState {
  status: SummaryStatus;
  text: string | null;
  setLoading: () => void;
  setReady: (text: string) => void;
  setError: () => void;
  reset: () => void;
}

/** Session-only cache for the AI spend summary (cleared on app restart). */
export const useSummaryStore = create<SummaryState>((set) => ({
  status: 'idle',
  text: null,
  setLoading: () => set({ status: 'loading' }),
  setReady: (text) => set({ status: 'ready', text }),
  setError: () => set({ status: 'error', text: null }),
  reset: () => set({ status: 'idle', text: null }),
}));
