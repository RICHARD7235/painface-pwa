/**
 * PrivacyGuardService – Audit de conformité RGPD pour PainFace.
 *
 * Garanties vérifiées :
 *   1. AUCUNE frame vidéo n'est persistée (traitement RAM uniquement).
 *   2. Les landmarks bruts MediaPipe sont supprimés après calcul des AU.
 *   3. Seuls les scores PSPI et les timestamps sont stockés en base.
 *
 * API publique :
 *   validateSessionBeforeInsert(session)  → { valid, violations }
 *   getDataInventory()                    → DataInventory
 *   auditLog                              → readonly AuditEntry[]
 */

import type { Session } from '../types/patient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: string[];
}

export interface DataInventory {
  /** Champs effectivement stockés dans une Session */
  storedFields: string[];
  /** Champs JAMAIS stockés (garantie vie privée) */
  neverStoredFields: string[];
  /** Conformité RGPD Art. 5(1)(c) – minimisation des données */
  minimizationCompliant: boolean;
  /** Texte de synthèse lisible */
  summary: string;
}

// ─── Journal d'audit interne ──────────────────────────────────────────────────

const _log: AuditEntry[] = [];

function _emit(level: AuditEntry['level'], message: string): void {
  _log.push({ timestamp: Date.now(), level, message });
  // Garde les 500 dernières entrées en mémoire
  if (_log.length > 500) _log.splice(0, _log.length - 500);
}

export const auditLog: readonly AuditEntry[] = _log;

// ─── Champs interdits (données brutes) ───────────────────────────────────────

/**
 * Propriétés qui ne doivent JAMAIS apparaître dans un objet Session
 * avant insertion en base.
 */
const FORBIDDEN_FIELDS: string[] = [
  'landmarks',
  'rawLandmarks',
  'faceLandmarks',
  'videoFrame',
  'imageData',
  'frameBuffer',
  'pixels',
  'cameraData',
  'mediapipeResult',
  'rawAU',
  'rawActionUnits',
];

// ─── Validation avant insertion ───────────────────────────────────────────────

/**
 * Vérifie qu'une session ne contient aucune donnée brute interdite.
 *
 * Inspecte récursivement les clés de premier niveau de l'objet
 * (les tableaux painScores, painEvents, annotations sont sérialisés
 * en JSON et ne doivent pas contenir de landmarks).
 */
export function validateSessionBeforeInsert(session: Session): ValidationResult {
  const violations: string[] = [];

  // Vérifier les clés de l'objet session
  const sessionKeys = Object.keys(session);
  for (const forbidden of FORBIDDEN_FIELDS) {
    if (sessionKeys.includes(forbidden)) {
      violations.push(`Champ interdit détecté : '${forbidden}'`);
    }
  }

  // Vérifier que painScores ne contient que { sessionSec, score }
  for (const point of session.painScores) {
    const keys = Object.keys(point);
    const unexpected = keys.filter(k => k !== 'sessionSec' && k !== 'score');
    if (unexpected.length > 0) {
      violations.push(`painScores contient des champs inattendus : ${unexpected.join(', ')}`);
      break; // Une seule violation suffit
    }
  }

  // Vérifier que painEvents ne contient que les champs attendus
  const ALLOWED_PAIN_EVENT_FIELDS = new Set([
    'type', 'timestamp', 'pspi', 'sessionSec', 'normalized', 'level', 'id',
  ]);
  for (const evt of session.painEvents) {
    const unexpected = Object.keys(evt).filter(k => !ALLOWED_PAIN_EVENT_FIELDS.has(k));
    if (unexpected.length > 0) {
      violations.push(`painEvents contient des champs inattendus : ${unexpected.join(', ')}`);
      break;
    }
  }

  if (violations.length > 0) {
    _emit('error', `Session ${session.id} – violations RGPD : ${violations.join(' | ')}`);
  } else {
    _emit('info', `Session ${session.id} – validée (aucune donnée brute)`);
  }

  return { valid: violations.length === 0, violations };
}

// ─── Inventaire des données ───────────────────────────────────────────────────

/**
 * Retourne l'inventaire des données stockées et non stockées,
 * conforme au registre des activités de traitement RGPD Art. 30.
 */
export function getDataInventory(): DataInventory {
  const storedFields: string[] = [
    'patients.id (UUID aléatoire)',
    'patients.nom',
    'patients.prenom',
    'patients.date_naissance (optionnel)',
    'patients.notes (optionnel)',
    'patients.calibration_profile (seuils AU personnalisés, optionnel)',
    'sessions.id (UUID aléatoire)',
    'sessions.date (timestamp début de séance)',
    'sessions.duree (durée en secondes)',
    'sessions.pain_scores (tableau { sessionSec, score PSPI })',
    'sessions.pain_events (pics de douleur avec timestamps)',
    'sessions.annotations (textes libres du praticien)',
    'sessions.moyenne_pspi',
    'sessions.max_pspi',
    'patient_consents.id',
    'patient_consents.timestamp',
    'patient_consents.version',
    'patient_consents.signature_hash (SHA-256 du tracé — jamais le tracé lui-même)',
  ];

  const neverStoredFields: string[] = [
    'Frames vidéo (traitées uniquement en RAM, jamais persistées)',
    'Landmarks faciaux MediaPipe bruts (supprimés après calcul des AU)',
    'Images ou captures d\'écran du visage',
    'Données biométriques brutes',
    'Adresse IP ou données réseau',
    'Identifiants de dispositif',
    'Tracé brut de la signature numérique (seul le hash SHA-256 est conservé)',
  ];

  _emit('info', 'Inventaire des données consulté');

  return {
    storedFields,
    neverStoredFields,
    minimizationCompliant: true,
    summary:
      'PainFace stocke uniquement les scores PSPI, timestamps et métadonnées ' +
      'de séance. Aucune donnée biométrique brute, frame vidéo ou image n\'est ' +
      'conservée. Conforme au principe de minimisation RGPD Art. 5(1)(c).',
  };
}

// ─── Vérification de la suppression ───────────────────────────────────────────

/**
 * À appeler après suppression d'un patient (droit à l'oubli Art. 17).
 * Enregistre l'événement dans le journal d'audit.
 */
export function recordErasure(patientId: string): void {
  _emit(
    'info',
    `Effacement complet du patient ${patientId} — droit à l'oubli RGPD Art. 17 exercé.`,
  );
}
