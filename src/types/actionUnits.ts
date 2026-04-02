/**
 * Types FACS – Action Units calculées à partir des landmarks MediaPipe.
 */

// ─── Intensités FACS ─────────────────────────────────────────────────────────

/** A = trace, B = légère, C = marquée, D = forte, E = extrême */
export type AUIntensity = 'A' | 'B' | 'C' | 'D' | 'E';

// ─── Score d'une AU ───────────────────────────────────────────────────────────

export interface AUScore {
  /** Numéro de l'Action Unit (4, 6, 7, 9, 10, 43) */
  au: number;
  /** Intensité 0–5 (0 = absent ; 1–5 = A–E) */
  score: number;
  /** Niveau qualitatif FACS, null si score = 0 */
  intensity: AUIntensity | null;
  /** Mesure brute normalisée avant mapping (debug / calibration) */
  raw: number;
}

// ─── Résultat complet ─────────────────────────────────────────────────────────

export interface ActionUnitsResult {
  au4: AUScore;   // Brow Lowerer
  au6: AUScore;   // Cheek Raiser
  au7: AUScore;   // Lid Tightener
  au9: AUScore;   // Nose Wrinkler
  au10: AUScore;  // Upper Lip Raiser
  au43: AUScore;  // Eyes Closed
  /** Date.now() au moment du calcul */
  timestamp: number;
}

// ─── Calibration ──────────────────────────────────────────────────────────────

export interface AUThreshold {
  /** Mesure moyenne en visage neutre */
  baseline: number;
  /** Écart-type de la baseline (bruit de mesure) */
  stdDev: number;
  /** Amplitude max observée → plafond du score 5 */
  range: number;
}

export interface CalibrationThresholds {
  au4: AUThreshold;
  au6: AUThreshold;
  au7: AUThreshold;
  au9: AUThreshold;
  au10: AUThreshold;
  au43: AUThreshold;
}

/** Tableau de mesures brutes collectées pendant la calibration */
export interface CalibrationSamples {
  au4: number[];
  au6: number[];
  au7: number[];
  au9: number[];
  au10: number[];
  au43: number[];
}

// ─── Score de douleur global ──────────────────────────────────────────────────

/** Niveau verbal PSPI */
export type PainLevel = 'absent' | 'léger' | 'modéré' | 'intense' | 'sévère';

/**
 * Score de douleur agrégé selon l'indice PSPI
 * (Prkachin & Solomon Pain Intensity Index, 2008).
 *
 * Formule : AU4 + min(AU6, AU7) + AU9 + AU10
 * Plage brute : 0–20  ·  Plage normalisée : 0–10
 *
 * Références : Prkachin K.M. & Solomon P.E. (2008). The structure,
 * reliability and validity of pain expression. Pain, 139(2), 267–274.
 */
export interface PainScore {
  /** Score PSPI brut, plage 0–20 */
  pspi: number;
  /** Score normalisé 0.0–10.0 (1 décimale) */
  normalized: number;
  /** Niveau verbal */
  level: PainLevel;
}
