/**
 * ActionUnitCalculator – Calcul des 6 FACS Action Units à partir des 468
 * landmarks MediaPipe Face Landmarker.
 *
 * Architecture :
 *   - Fonctions pures `measure*` : extraient une mesure brute normalisée [0, ∞[
 *   - `rawToScore`               : convertit la mesure en score FACS 0–5
 *   - `ActionUnitCalculator`     : façade principale, supporte la calibration
 *   - `CalibrationManager`       : collecte 30 s de visage neutre → seuils perso
 *
 * Repère MediaPipe : x,y ∈ [0,1], y croissant vers le bas de l'image.
 */

import type { NormalizedLandmark } from '../types/facemesh';
import type {
  AUScore,
  ActionUnitsResult,
  AUThreshold,
  CalibrationThresholds,
  CalibrationSamples,
  PainLevel,
  PainScore,
} from '../types/actionUnits';

// ─── Seuils par défaut ────────────────────────────────────────────────────────
// Valeurs baselines calculées analytiquement sur un visage moyen normalisé.
// La calibration personnalisée les remplace après 30 s de visage neutre.

const DEFAULT_THRESHOLDS: CalibrationThresholds = {
  au4:  { baseline: 0.19, stdDev: 0.020, range: 0.15 }, // gap sourcil-oeil
  au6:  { baseline: 0.38, stdDev: 0.020, range: 0.15 }, // gap joue-oeil
  // AU7 : EAR 2-points pour yeux ouverts ≈ 0.25–0.32 → baseline corrigée (était 0.64)
  au7:  { baseline: 0.30, stdDev: 0.030, range: 0.25 }, // ouverture palpébrale
  au9:  { baseline: 0.12, stdDev: 0.012, range: 0.08 }, // longueur nez
  au10: { baseline: 0.27, stdDev: 0.015, range: 0.15 }, // ouverture lèvre
  // AU43 : EAR 6-points pour yeux ouverts ≈ 0.25–0.33 → baseline corrigée (était 0.50)
  au43: { baseline: 0.30, stdDev: 0.020, range: 0.25 }, // EAR yeux
};

const CALIBRATION_DURATION_MS = 30_000;
// 10 échantillons minimum (≈ 5 s à ~2 fps réels WebView+JPEG).
// 30 était trop élevé : à 2 fps × 10 s ≈ 20 frames < 30 → fallback silencieux
// aux seuils par défaut, annulant tout le bénéfice de la calibration.
const MIN_SAMPLES = 10;

// ─── Helpers géométriques ─────────────────────────────────────────────────────

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function midY(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return (a.y + b.y) * 0.5;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// ─── Mesures brutes par AU ────────────────────────────────────────────────────

/**
 * AU4 – Brow Lowerer (corrugateur).
 * Mesure le gap vertical sourcil-interne / paupière-supérieure, normalisé
 * par la distance inter-oculaire.
 * Sourcil ABAISSÉ → gap RÉDUIT → valeur PETITE → score AU4 élevé (inverted).
 *
 * Landmarks : 55, 65 (sourcil interne gauche) · 52, 296 (sourcil interne droit)
 *             159 / 386 (paupières supérieures) · 33, 263 (coins oculaires)
 */
function measureAU4(lm: NormalizedLandmark[]): number {
  const leftBrowY  = midY(lm[55], lm[65]);
  const rightBrowY = midY(lm[52], lm[296]);
  const leftEyeY   = lm[159].y;
  const rightEyeY  = lm[386].y;
  const interOcular = dist2D(lm[33], lm[263]);
  if (interOcular === 0) return 0;
  const gapL = (leftEyeY  - leftBrowY)  / interOcular;
  const gapR = (rightEyeY - rightBrowY) / interOcular;
  return (gapL + gapR) * 0.5;
}

/**
 * AU6 – Cheek Raiser (orbiculaire zygomatique).
 * Mesure le gap vertical joue / coin-externe-oeil, normalisé par inter-oculaire.
 * Joue LEVÉE → gap RÉDUIT → valeur PETITE → score élevé (inverted).
 *
 * Landmarks : 117, 123 (joue gauche) · 346, 352 (joue droite)
 *             33, 263 (coins externes des yeux)
 */
function measureAU6(lm: NormalizedLandmark[]): number {
  const leftCheekY  = midY(lm[117], lm[123]);
  const rightCheekY = midY(lm[346], lm[352]);
  const leftEyeY    = lm[33].y;
  const rightEyeY   = lm[263].y;
  const interOcular = dist2D(lm[33], lm[263]);
  if (interOcular === 0) return 0;
  const gapL = (leftCheekY  - leftEyeY)  / interOcular;
  const gapR = (rightCheekY - rightEyeY) / interOcular;
  return (gapL + gapR) * 0.5;
}

/**
 * AU7 – Lid Tightener (orbiculaire palpébral).
 * Ratio ouverture-verticale / largeur-oeil (simplifié 2 points).
 * Paupière RESSERRÉE → ratio RÉDUIT → valeur PETITE → score élevé (inverted).
 *
 * Landmarks : 159, 145 (paupieres G) · 386, 374 (paupières D)
 *             33, 133 (largeur oeil G) · 263, 362 (largeur oeil D)
 */
function measureAU7(lm: NormalizedLandmark[]): number {
  const openL = Math.abs(lm[145].y - lm[159].y);
  const openR = Math.abs(lm[374].y - lm[386].y);
  const widthL = dist2D(lm[33],  lm[133]);
  const widthR = dist2D(lm[263], lm[362]);
  const earL = widthL > 0 ? openL / widthL : 0;
  const earR = widthR > 0 ? openR / widthR : 0;
  return (earL + earR) * 0.5;
}

/**
 * AU9 – Nose Wrinkler (releveur narine).
 * Somme des distances intra-nez (4↔5, 195↔197), normalisée par inter-oculaire.
 * Nez PLISSÉ → distances RÉDUITES → valeur PETITE → score élevé (inverted).
 *
 * Landmarks : 4, 5 (tip/pont nez) · 195, 197 (points internes tip)
 */
function measureAU9(lm: NormalizedLandmark[]): number {
  const d1 = dist2D(lm[4],   lm[5]);
  const d2 = dist2D(lm[195], lm[197]);
  const interOcular = dist2D(lm[33], lm[263]);
  if (interOcular === 0) return 0;
  return (d1 + d2) * 0.5 / interOcular;
}

/**
 * AU10 – Upper Lip Raiser (releveur lèvre sup).
 * Ratio ouverture-interne-bouche / distance-lèvre-menton.
 * Lèvre LEVÉE → ouverture AUGMENTE → valeur GRANDE → score élevé (direct).
 *
 * Landmarks : 0 (bord ext lèvre sup) · 13 (bord int lèvre sup)
 *             14 (bord int lèvre inf) · 17 (menton)
 */
function measureAU10(lm: NormalizedLandmark[]): number {
  const lipTopY        = midY(lm[0], lm[13]);
  const lipBotY        = lm[14].y;
  const chinY          = lm[17].y;
  const mouthChinDist  = Math.abs(chinY - lipTopY);
  if (mouthChinDist === 0) return 0;
  const innerOpening = Math.abs(lipBotY - lipTopY);
  return innerOpening / mouthChinDist;
}

/**
 * AU43 – Eyes Closed (orbiculaire complet).
 * Eye Aspect Ratio classique à 6 points (Soukupová & Cech 2016).
 * EAR = (|p2−p6| + |p3−p5|) / (2 · |p1−p4|)
 * Yeux FERMÉS → EAR RÉDUIT → valeur PETITE → score élevé (inverted).
 *
 * Oeil gauche  : coins 33/133, points verticaux 160, 158, 153, 144
 * Oeil droit   : coins 263/362, points verticaux 387, 385, 380, 373
 */
function eyeAspectRatio(
  p1: NormalizedLandmark, p2: NormalizedLandmark, p3: NormalizedLandmark,
  p4: NormalizedLandmark, p5: NormalizedLandmark, p6: NormalizedLandmark,
): number {
  const a = dist2D(p2, p6);
  const b = dist2D(p3, p5);
  const c = dist2D(p1, p4);
  return c > 0 ? (a + b) / (2 * c) : 0;
}

function measureAU43(lm: NormalizedLandmark[]): number {
  const earL = eyeAspectRatio(lm[33],  lm[160], lm[158], lm[133], lm[153], lm[144]);
  const earR = eyeAspectRatio(lm[263], lm[387], lm[385], lm[362], lm[380], lm[373]);
  return (earL + earR) * 0.5;
}

// ─── Mapping mesure → score 0–5 ──────────────────────────────────────────────

/**
 * Convertit une mesure brute en score FACS 0–5 :
 *   0     → AU absente (delta <= bruit)
 *   1 (A) → trace         … 5 (E) → extrême
 *
 * @param inverted true si AU active = valeur PETITE (AU4, AU6, AU7, AU9, AU43)
 */
function rawToScore(raw: number, t: AUThreshold, inverted: boolean): number {
  const delta = inverted ? t.baseline - raw : raw - t.baseline;
  if (delta <= t.stdDev) return 0;
  const normalized = clamp((delta - t.stdDev) / Math.max(t.range, 1e-4), 0, 1);
  // 1 (trace) à 5 (extrême) avec transition linéaire
  return Math.round(1 + normalized * 4);
}

function scoreToIntensity(score: number): AUScore['intensity'] {
  if (score <= 0) return null;
  return (['A', 'B', 'C', 'D', 'E'] as const)[score - 1] ?? null;
}

function makeScore(au: number, raw: number, t: AUThreshold, inverted: boolean): AUScore {
  const score = rawToScore(raw, t, inverted);
  return { au, score, intensity: scoreToIntensity(score), raw };
}

// ─── PSPI helpers ─────────────────────────────────────────────────────────────

/**
 * Convertit un score PSPI normalisé (0–10) en niveau verbal.
 * Seuils : absent=0 · léger<2.5 · modéré<5 · intense<7.5 · sévère≥7.5
 */
function pspiToLevel(score: number): PainLevel {
  if (score === 0)  return 'absent';
  if (score < 2.5)  return 'léger';
  if (score < 5.0)  return 'modéré';
  if (score < 7.5)  return 'intense';
  return 'sévère';
}

// ─── ActionUnitCalculator ────────────────────────────────────────────────────

export class ActionUnitCalculator {
  private thresholds: CalibrationThresholds;

  constructor(thresholds?: CalibrationThresholds) {
    this.thresholds = thresholds ?? DEFAULT_THRESHOLDS;
  }

  /** Remplace les seuils (sortie de CalibrationManager.stop()). */
  setThresholds(t: CalibrationThresholds): void {
    this.thresholds = t;
  }

  getThresholds(): CalibrationThresholds {
    return { ...this.thresholds };
  }

  /**
   * Calcule les 6 AU à partir d'un tableau de landmarks (visage unique).
   * Retourne null si le tableau contient moins de 468 points.
   */
  compute(landmarks: NormalizedLandmark[]): ActionUnitsResult | null {
    if (landmarks.length < 468) return null;
    const t = this.thresholds;
    return {
      au4:  makeScore(4,  measureAU4(landmarks),  t.au4,  true),
      au6:  makeScore(6,  measureAU6(landmarks),  t.au6,  true),
      au7:  makeScore(7,  measureAU7(landmarks),  t.au7,  true),
      au9:  makeScore(9,  measureAU9(landmarks),  t.au9,  true),
      au10: makeScore(10, measureAU10(landmarks), t.au10, false),
      au43: makeScore(43, measureAU43(landmarks), t.au43, true),
      timestamp: Date.now(),
    };
  }

  /**
   * Calcule le score de douleur PSPI à partir des AU déjà calculées.
   *
   * PSPI (Prkachin & Solomon, 2008) :
   *   AU4 + min(AU6, AU7) + AU9 + AU10
   *
   * Plage brute 0–20 → normalisée 0–10 (1 décimale).
   * AU43 (yeux fermés) est exclue : elle n'est pas dans le PSPI validé
   * et peut refléter la somnolence plutôt que la douleur.
   */
  computePainScore(aus: ActionUnitsResult): PainScore {
    const pspi = aus.au4.score
      + Math.min(aus.au6.score, aus.au7.score)
      + aus.au9.score
      + aus.au10.score;
    const normalized = Math.round((pspi / 20) * 100) / 10; // 0.0–10.0
    return { pspi, normalized, level: pspiToLevel(normalized) };
  }

  /**
   * Retourne uniquement les mesures brutes (pour la calibration).
   * Retourne null si le tableau contient moins de 468 points.
   */
  measureRaw(landmarks: NormalizedLandmark[]): Record<keyof CalibrationThresholds, number> | null {
    if (landmarks.length < 468) return null;
    return {
      au4:  measureAU4(landmarks),
      au6:  measureAU6(landmarks),
      au7:  measureAU7(landmarks),
      au9:  measureAU9(landmarks),
      au10: measureAU10(landmarks),
      au43: measureAU43(landmarks),
    };
  }
}

// ─── CalibrationManager ──────────────────────────────────────────────────────

/**
 * Collecte les mesures brutes pendant 30 secondes de visage neutre, puis
 * calcule les seuils personnalisés (baseline + stdDev + range).
 *
 * Usage :
 *   const mgr = new CalibrationManager(calculator);
 *   mgr.start();
 *   // Dans la boucle MediaPipe :
 *   mgr.addFrame(landmarks[0]);
 *   // Après 30 s ou sur interaction utilisateur :
 *   const thresholds = mgr.stop();
 *   calculator.setThresholds(thresholds);
 */
export class CalibrationManager {
  private readonly calc: ActionUnitCalculator;
  private readonly durationMs: number;
  private samples: CalibrationSamples = emptySamples();
  private startTime: number | null = null;
  private calibrating = false;

  constructor(
    calculator?: ActionUnitCalculator,
    options?: { durationMs?: number },
  ) {
    this.calc = calculator ?? new ActionUnitCalculator();
    this.durationMs = options?.durationMs ?? CALIBRATION_DURATION_MS;
  }

  /** Démarre une nouvelle session (réinitialise les données). */
  start(): void {
    this.samples = emptySamples();
    this.startTime = Date.now();
    this.calibrating = true;
  }

  /**
   * Ajoute un frame de landmarks.
   * Auto-stoppe après CALIBRATION_DURATION_MS.
   * Retourne false si la calibration n'est pas en cours.
   */
  addFrame(landmarks: NormalizedLandmark[]): boolean {
    if (!this.calibrating) return false;
    const raw = this.calc.measureRaw(landmarks);
    if (!raw) return false;

    this.samples.au4.push(raw.au4);
    this.samples.au6.push(raw.au6);
    this.samples.au7.push(raw.au7);
    this.samples.au9.push(raw.au9);
    this.samples.au10.push(raw.au10);
    this.samples.au43.push(raw.au43);

    if (Date.now() - (this.startTime ?? 0) >= this.durationMs) {
      this.calibrating = false;
    }
    return true;
  }

  /** Arrête la calibration et retourne les seuils calculés. */
  stop(): CalibrationThresholds {
    this.calibrating = false;
    return this.buildThresholds();
  }

  /** Progression [0, 1] basée sur le temps écoulé. */
  getProgress(): number {
    if (!this.startTime) return 0;
    return clamp((Date.now() - this.startTime) / this.durationMs, 0, 1);
  }

  isCalibrating(): boolean {
    return this.calibrating;
  }

  getSampleCount(): number {
    return this.samples.au4.length;
  }

  /** true après stop() avec suffisamment d'échantillons. */
  isComplete(): boolean {
    return !this.calibrating && this.samples.au4.length >= MIN_SAMPLES;
  }

  private buildThresholds(): CalibrationThresholds {
    const keys = ['au4', 'au6', 'au7', 'au9', 'au10', 'au43'] as const;
    const result = {} as CalibrationThresholds;

    for (const key of keys) {
      const arr = this.samples[key];
      if (arr.length < MIN_SAMPLES) {
        // Pas assez d'échantillons → fallback sur les seuils par défaut
        console.warn(
          `[CalibrationManager] ${key}: ${arr.length} échantillons < ${MIN_SAMPLES} minimum → seuil par défaut conservé`,
        );
        result[key] = DEFAULT_THRESHOLDS[key];
        continue;
      }
      const baseline = mean(arr);
      const stdDev   = std(arr, baseline);
      // range = max(4× stdDev, range par défaut de l'AU).
      // Le plancher sur la range par défaut évite qu'une calibration très
      // stable (stdDev ≈ 0) rende le système hyper-sensible aux micro-
      // mouvements normaux.
      const range    = Math.max(stdDev * 4, DEFAULT_THRESHOLDS[key].range);
      result[key] = { baseline, stdDev, range };
    }
    return result;
  }
}

// ─── Stats utilitaires ────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[], avg: number): number {
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function emptySamples(): CalibrationSamples {
  return { au4: [], au6: [], au7: [], au9: [], au10: [], au43: [] };
}
