import type { DetectionStatus, NormalizedLandmark } from '../types/facemesh';

// ─── Indices landmarks MediaPipe clés ──────────────────────────────────────────
// Référence : https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker
const IDX_NOSE_TIP = 1;
const IDX_NOSE_BRIDGE = 6;
const IDX_EYE_LEFT_OUTER = 33;
const IDX_EYE_RIGHT_OUTER = 263;
const IDX_CHEEK_LEFT = 234;
const IDX_CHEEK_RIGHT = 454;
const IDX_FOREHEAD_TOP = 10;
const IDX_CHIN = 152;

// ─── Helpers ───────────────────────────────────────────────────────────────────
function lm(landmarks: NormalizedLandmark[], idx: number): NormalizedLandmark {
  return landmarks[idx] ?? { x: 0.5, y: 0.5, z: 0 };
}

// ─── Détections cas limites ────────────────────────────────────────────────────

/**
 * Visage trop loin : distance horizontale entre joues < 25 % de la largeur normalisée.
 */
export function isTooFar(landmarks: NormalizedLandmark[]): boolean {
  const left = lm(landmarks, IDX_CHEEK_LEFT);
  const right = lm(landmarks, IDX_CHEEK_RIGHT);
  return Math.abs(right.x - left.x) < 0.25;
}

/**
 * Rotation excessive (yaw) : la pointe du nez s'écarte > 15 % de la médiane X des yeux.
 */
export function isExcessivelyRotated(landmarks: NormalizedLandmark[]): boolean {
  const nose = lm(landmarks, IDX_NOSE_TIP);
  const eyeL = lm(landmarks, IDX_EYE_LEFT_OUTER);
  const eyeR = lm(landmarks, IDX_EYE_RIGHT_OUTER);
  const eyeMidX = (eyeL.x + eyeR.x) / 2;
  return Math.abs(nose.x - eyeMidX) > 0.15;
}

/**
 * Visage partiellement hors cadre : au moins un landmark clé hors de [0.03, 0.97].
 */
export function isPartiallyVisible(landmarks: NormalizedLandmark[]): boolean {
  const keyIndices = [
    IDX_FOREHEAD_TOP,
    IDX_CHIN,
    IDX_CHEEK_LEFT,
    IDX_CHEEK_RIGHT,
    IDX_NOSE_TIP,
    IDX_NOSE_BRIDGE,
  ];
  const margin = 0.03;
  return keyIndices.some((idx) => {
    const p = lm(landmarks, idx);
    return p.x < margin || p.x > 1 - margin || p.y < margin || p.y > 1 - margin;
  });
}

/**
 * Calcule le statut global de détection (priorité : partial > rotated > too_far > detected).
 */
export function computeDetectionStatus(faces: NormalizedLandmark[][]): DetectionStatus {
  if (faces.length === 0) return 'no_face';

  const face = faces[0];

  if (isPartiallyVisible(face)) return 'partial';
  if (isExcessivelyRotated(face)) return 'rotated';
  if (isTooFar(face)) return 'too_far';

  return 'detected';
}

/**
 * Texte affiché à l'utilisateur selon le statut.
 */
export function getStatusText(status: DetectionStatus): string {
  switch (status) {
    case 'loading':
      return 'Initialisation IA...';
    case 'no_face':
      return 'Aucun visage';
    case 'detected':
      return 'Visage détecté ✓';
    case 'partial':
      return 'Visage partiellement visible';
    case 'too_far':
      return 'Rapprochez-vous';
    case 'rotated':
      return 'Regardez face à la caméra';
    case 'error':
      return 'Erreur IA ⚠️';
    default:
      return '';
  }
}

/**
 * Couleur du badge selon le statut.
 */
export function getStatusColor(status: DetectionStatus): string {
  switch (status) {
    case 'detected':
      return '#16a34a'; // vert
    case 'partial':
    case 'too_far':
    case 'rotated':
      return '#d97706'; // orange
    case 'no_face':
      return '#6b7280'; // gris
    case 'error':
      return '#dc2626'; // rouge
    case 'loading':
    default:
      return '#4f46e5'; // indigo
  }
}
