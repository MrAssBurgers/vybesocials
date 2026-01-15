/**
 * VYBE Feature Flags
 * 
 * Controls which features are enabled/disabled.
 * Use for A/B testing, gradual rollouts, and hiding WIP features.
 */

export interface FeatureFlags {
  // VYBE Minis - mini apps platform (hidden, in development)
  minis_enabled: boolean;
  
  // Debug panel for developers
  debug_panel_enabled: boolean;
  
  // AI features
  ai_smart_replies: boolean;
  ai_chat_summary: boolean;
  
  // Experimental features
  vanish_threads: boolean;
  memory_pins: boolean;
  
  // Analytics
  analytics_enabled: boolean;
}

// Default flags - these are the production defaults
const defaultFlags: FeatureFlags = {
  minis_enabled: false, // Hidden, not ready for public
  debug_panel_enabled: import.meta.env.DEV, // Only in dev mode
  ai_smart_replies: true,
  ai_chat_summary: true,
  vanish_threads: true,
  memory_pins: true,
  analytics_enabled: true,
};

// Local storage key for flag overrides
const STORAGE_KEY = 'vybe-feature-flags';

// Get stored overrides
function getStoredOverrides(): Partial<FeatureFlags> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Get current feature flags (defaults + overrides)
export function getFeatureFlags(): FeatureFlags {
  const overrides = getStoredOverrides();
  return { ...defaultFlags, ...overrides };
}

// Check if a specific flag is enabled
export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  return getFeatureFlags()[flag];
}

// Set a flag override (for dev/testing)
export function setFeatureFlag(flag: keyof FeatureFlags, value: boolean): void {
  const overrides = getStoredOverrides();
  overrides[flag] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

// Reset all overrides to defaults
export function resetFeatureFlags(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// Convenience accessor
export const FLAGS = new Proxy({} as FeatureFlags, {
  get(_, prop: keyof FeatureFlags) {
    return isFeatureEnabled(prop);
  },
});
