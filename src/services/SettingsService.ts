/**
 * SettingsService – Persistance des paramètres via localStorage.
 *
 * API identique à la version SQLite :
 *   loadSettings()           → AppSettings (avec cache mémoire)
 *   saveSettings(s)          → void
 *   resetSettings()          → void
 *   invalidateSettingsCache()→ void
 */

import type { CalibrationThresholds } from '../types/actionUnits';

// ─── Seuils AU par défaut ─────────────────────────────────────────────────────

export const DEFAULT_AU_THRESHOLDS: CalibrationThresholds = {
  au4:  { baseline: 0.19, stdDev: 0.020, range: 0.15 },
  au6:  { baseline: 0.38, stdDev: 0.020, range: 0.15 },
  au7:  { baseline: 0.30, stdDev: 0.030, range: 0.25 },
  au9:  { baseline: 0.12, stdDev: 0.012, range: 0.08 },
  au10: { baseline: 0.27, stdDev: 0.015, range: 0.15 },
  au43: { baseline: 0.30, stdDev: 0.020, range: 0.25 },
};

// ─── Type des paramètres globaux ──────────────────────────────────────────────

export interface AppSettings {
  thresholds: CalibrationThresholds;
  smoothingWindowMs: number;
  spikeLowThreshold: number;
  spikeHighThreshold: number;
  pspiDoubleBipThreshold: number;
  calibrationDurationSec: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  thresholds:             DEFAULT_AU_THRESHOLDS,
  smoothingWindowMs:      2000,
  spikeLowThreshold:      3,
  spikeHighThreshold:     8,
  pspiDoubleBipThreshold: 12,
  calibrationDurationSec: 10,
};

const STORAGE_KEY = 'painface_settings';

// ─── Cache mémoire ───────────────────────────────────────────────────────────

let _cache: AppSettings | null = null;

// ─── API publique ─────────────────────────────────────────────────────────────

export function loadSettings(): AppSettings {
  if (_cache) return _cache;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      const def = DEFAULT_APP_SETTINGS;
      _cache = {
        ...def,
        ...parsed,
        thresholds: {
          au4:  { ...def.thresholds.au4,  ...parsed.thresholds?.au4  },
          au6:  { ...def.thresholds.au6,  ...parsed.thresholds?.au6  },
          au7:  { ...def.thresholds.au7,  ...parsed.thresholds?.au7  },
          au9:  { ...def.thresholds.au9,  ...parsed.thresholds?.au9  },
          au10: { ...def.thresholds.au10, ...parsed.thresholds?.au10 },
          au43: { ...def.thresholds.au43, ...parsed.thresholds?.au43 },
        },
      };
    } else {
      _cache = { ...DEFAULT_APP_SETTINGS };
    }
  } catch {
    _cache = { ...DEFAULT_APP_SETTINGS };
  }

  return _cache;
}

export function saveSettings(settings: AppSettings): void {
  _cache = settings;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resetSettings(): void {
  _cache = { ...DEFAULT_APP_SETTINGS };
  localStorage.removeItem(STORAGE_KEY);
}

export function invalidateSettingsCache(): void {
  _cache = null;
}
