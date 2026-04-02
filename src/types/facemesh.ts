export interface NormalizedLandmark {
  x: number; // 0-1 normalisé (horizontal)
  y: number; // 0-1 normalisé (vertical)
  z: number; // profondeur (négatif = plus proche caméra)
}

export type DetectionStatus =
  | 'loading' // MediaPipe en cours d'initialisation
  | 'no_face' // Aucun visage détecté
  | 'detected' // Visage détecté, qualité OK
  | 'partial' // Visage partiellement hors cadre
  | 'too_far' // Visage trop loin
  | 'rotated' // Rotation excessive de la tête
  | 'error'; // Erreur de chargement MediaPipe

/** Étape en cours lors du chargement de MediaPipe (pour affichage progression). */
export type LoadingStep = 'cdn_loading' | 'wasm_loading' | 'model_loading';

export interface FaceMeshMessage {
  type: 'ready' | 'landmarks' | 'error' | 'progress';
  landmarks?: NormalizedLandmark[][]; // [visage][landmark 0-467]
  imageWidth?: number;
  imageHeight?: number;
  message?: string;
  step?: LoadingStep; // présent si type === 'progress'
}
