/**
 * positioningAnalysis.ts
 *
 * Analyse en temps réel du positionnement du visage dans le cadre caméra.
 * Utilise les landmarks MediaPipe Face Mesh (468 points normalisés 0-1).
 *
 * Indicateurs produits :
 *  - distance   : TROP_PRES | OK | TROP_LOIN
 *  - centrage   : centrage H/V avec dérive mesurée
 *  - inclinaison: angle de roulis du téléphone (deg)
 *  - luminosité : heuristique (durée de non-détection)
 *  - état global: 'good' | 'adjust' | 'no_face'
 */

import type { DetectionStatus, NormalizedLandmark } from '../types/facemesh';

// ─── Indices MediaPipe Face Mesh ──────────────────────────────────────────────
const IDX_EYE_LEFT_OUTER  = 33;   // coin externe œil gauche (sujet)
const IDX_EYE_RIGHT_OUTER = 263;  // coin externe œil droit (sujet)
const IDX_CHEEK_LEFT      = 234;
const IDX_CHEEK_RIGHT     = 454;
const IDX_FOREHEAD        = 10;
const IDX_CHIN            = 152;
const IDX_NOSE_TIP        = 1;

// ─── Types ────────────────────────────────────────────────────────────────────

export type PositioningState = 'good' | 'adjust' | 'no_face';

export interface PositioningHint {
  /** Texte principal affiché sous l'ovale */
  primary: string;
  /** Texte secondaire (cause possible) */
  secondary?: string;
  /** Priorité : 0 = faible, 2 = critique */
  priority: 0 | 1 | 2;
}

export interface PositioningAnalysis {
  state:         PositioningState;
  /** Couleur de l'ovale en hex */
  frameColor:    string;
  hints:         PositioningHint[];
  /** Bounding box du visage (normalisée 0-1) */
  faceRect:      { x: number; y: number; w: number; h: number } | null;
  /** Centre du visage normalisé */
  faceCenter:    { x: number; y: number } | null;
  /** Largeur relative du visage (par rapport à la largeur du cadre) */
  faceWidthRel:  number;
  /** Angle de roulis des yeux (deg) */
  tiltDeg:       number;
}

// ─── Seuils ───────────────────────────────────────────────────────────────────

const FACE_WIDTH_MIN  = 0.22;  // trop loin si < 22 %
const FACE_WIDTH_MAX  = 0.72;  // trop proche si > 72 %
const FACE_WIDTH_GOOD_MIN = 0.30;
const FACE_WIDTH_GOOD_MAX = 0.60;

const CENTER_X_MARGIN = 0.15; // hors [0.5-m, 0.5+m] → décentré
const CENTER_Y_MARGIN = 0.15;

const TILT_MAX_DEG = 15; // roulis acceptable

// ─── Helper ───────────────────────────────────────────────────────────────────

function lm(landmarks: NormalizedLandmark[], idx: number): NormalizedLandmark {
  return landmarks[idx] ?? { x: 0.5, y: 0.5, z: 0 };
}

// ─── Analyse principale ───────────────────────────────────────────────────────

/**
 * Analyse le positionnement à partir des landmarks et du statut MediaPipe.
 *
 * @param landmarks  Tableau des 468 landmarks normalisés (ou null)
 * @param status     Statut de détection
 * @param noFaceMs   Nombre de ms depuis la dernière détection (pour heuristique luminosité)
 */
export function analyzePositioning(
  landmarks:  NormalizedLandmark[] | null | undefined,
  status:     DetectionStatus,
  noFaceMs:   number = 0,
): PositioningAnalysis {

  // ── Aucun visage ─────────────────────────────────────────────────────────
  if (!landmarks || landmarks.length === 0 || status === 'no_face' || status === 'error') {
    const hints: PositioningHint[] = [
      { primary: 'Aucun visage détecté', priority: 2 },
    ];

    if (noFaceMs > 4000) {
      hints.push({ primary: 'Meilleur éclairage nécessaire', priority: 1 });
    }
    hints.push({ primary: 'Placez votre visage dans le cadre', secondary: 'Regardez directement la caméra', priority: 0 });

    return {
      state: 'no_face',
      frameColor: '#ef4444',
      hints,
      faceRect:   null,
      faceCenter: null,
      faceWidthRel: 0,
      tiltDeg: 0,
    };
  }

  // ── Chargement ───────────────────────────────────────────────────────────
  if (status === 'loading') {
    return {
      state: 'no_face',
      frameColor: '#6b7280',
      hints: [{ primary: 'Initialisation…', priority: 0 }],
      faceRect: null,
      faceCenter: null,
      faceWidthRel: 0,
      tiltDeg: 0,
    };
  }

  // ── Bounding box du visage ────────────────────────────────────────────────
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const faceW = maxX - minX;
  const faceH = maxY - minY;
  const faceCx = (minX + maxX) / 2;
  const faceCy = (minY + maxY) / 2;

  // ── Distance ─────────────────────────────────────────────────────────────
  // On utilise l'écart entre joues (plus stable) comme proxy de distance
  const cheekL = lm(landmarks, IDX_CHEEK_LEFT);
  const cheekR = lm(landmarks, IDX_CHEEK_RIGHT);
  const faceWidthRel = Math.abs(cheekR.x - cheekL.x);

  // ── Inclinaison (roulis téléphone) ───────────────────────────────────────────
  //
  // On mesure l'angle de la droite reliant les deux coins externes des yeux.
  //
  // Problème caméra frontale miroir :
  //   En mode miroir, le landmark 33 (œil GAUCHE du sujet) apparaît côté DROIT
  //   de l'image (x élevé) et le 263 (œil DROIT du sujet) côté GAUCHE (x faible).
  //   Donc dx = eyeB.x - eyeA.x est NÉGATIF quand le visage est droit
  //   → atan2(dy, dx) donne ~±180° au lieu de 0°.
  //
  // Solution : Math.abs(dx) normalise la direction, ramenant le cas "droit" à 0°
  //   quelle que soit l'orientation miroir.
  //
  // Garde : si abs(dx) < 0.05 le visage est presque de profil (lacet > ~80°),
  //   l'estimation devient instable — on ignore.
  const eyeA = lm(landmarks, IDX_EYE_LEFT_OUTER);  // 33
  const eyeB = lm(landmarks, IDX_EYE_RIGHT_OUTER); // 263
  const dxEye = eyeB.x - eyeA.x;
  const dyEye = eyeB.y - eyeA.y;
  const tiltDeg = Math.abs(dxEye) > 0.05
    ? Math.atan2(dyEye, Math.abs(dxEye)) * (180 / Math.PI)
    : 0;

  // ── Collecte des problèmes ────────────────────────────────────────────────
  const hints: PositioningHint[] = [];

  // Distance
  if (faceWidthRel < FACE_WIDTH_MIN) {
    hints.push({ primary: 'Rapprochez le téléphone', priority: 2 });
  } else if (faceWidthRel > FACE_WIDTH_MAX) {
    hints.push({ primary: 'Éloignez le téléphone', priority: 2 });
  } else if (faceWidthRel < FACE_WIDTH_GOOD_MIN) {
    hints.push({ primary: 'Un peu plus près', priority: 1 });
  } else if (faceWidthRel > FACE_WIDTH_GOOD_MAX) {
    hints.push({ primary: 'Un peu plus loin', priority: 1 });
  }

  // Centrage horizontal
  const driftX = faceCx - 0.5;
  if (driftX < -CENTER_X_MARGIN) {
    hints.push({ primary: 'Déplacez vers la droite', priority: 1 });
  } else if (driftX > CENTER_X_MARGIN) {
    hints.push({ primary: 'Déplacez vers la gauche', priority: 1 });
  }

  // Centrage vertical (le visage devrait être légèrement au-dessus du centre)
  const driftY = faceCy - 0.45;
  if (driftY < -CENTER_Y_MARGIN) {
    hints.push({ primary: 'Déplacez vers le bas', priority: 1 });
  } else if (driftY > CENTER_Y_MARGIN) {
    hints.push({ primary: 'Déplacez vers le haut', priority: 1 });
  }

  // Inclinaison
  if (Math.abs(tiltDeg) > TILT_MAX_DEG) {
    hints.push({
      primary: 'Redressez le téléphone',
      secondary: `Inclinaison : ${Math.abs(tiltDeg).toFixed(0)}°`,
      priority: 1,
    });
  }

  // Visage hors cadre (cas MediaPipe 'partial')
  if (status === 'partial') {
    hints.unshift({ primary: 'Reculez ou recentrez', priority: 2 });
  }

  // ── Résultat ──────────────────────────────────────────────────────────────
  const hasCritical = hints.some(h => h.priority === 2);
  const hasMinor    = hints.some(h => h.priority >= 1);

  let state:      PositioningState;
  let frameColor: string;

  if (hasCritical) {
    state      = 'adjust';
    frameColor = '#ef4444'; // rouge
  } else if (hasMinor) {
    state      = 'adjust';
    frameColor = '#f59e0b'; // orange
  } else {
    state      = 'good';
    frameColor = '#22c55e'; // vert
  }

  return {
    state,
    frameColor,
    hints: hints.slice(0, 2), // max 2 hints affichés simultanément
    faceRect:    { x: minX, y: minY, w: faceW, h: faceH },
    faceCenter:  { x: faceCx, y: faceCy },
    faceWidthRel,
    tiltDeg,
  };
}

/** Calcule la fréquence (Hz) du bip selon l'intensité du spike PSPI. */
export function spikeBeepFrequency(scoreAfter: number): number {
  // 440 Hz (La3) à PSPI 8 → 1100 Hz à PSPI 16
  const normalized = Math.max(0, Math.min(1, (scoreAfter - 8) / 8));
  return Math.round(440 + normalized * 660);
}

/** Durée du bip (secondes) : bref à léger, plus long à sévère. */
export function spikeBeepDuration(scoreAfter: number): number {
  if (scoreAfter >= 14) return 0.30;
  if (scoreAfter >= 11) return 0.22;
  return 0.15;
}
