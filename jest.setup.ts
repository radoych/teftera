jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    multiGet: jest.fn(),
    multiSet: jest.fn(),
    getAllKeys: jest.fn(),
    clear: jest.fn(),
  },
}));

// Module-level stub to prevent import-time Supabase client init in tests.
// Tests that need real Supabase behavior must provide their own jest.mock override.
jest.mock('@/services/supabase', () => ({
  supabase: {},
}));

// Native-module stubs so pure modules that import the lib/ wrappers
// (features/loyalty/useBrightnessBoost.ts) stay testable.
jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn(() => Promise.resolve(0.5)),
  setBrightnessAsync: jest.fn(() => Promise.resolve()),
  restoreSystemBrightnessAsync: jest.fn(() => Promise.resolve()),
}));
