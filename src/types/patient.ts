/**
 * Types domaine – Patients & Sessions de monitoring.
 */

import type { CalibrationThresholds } from './actionUnits';

// ─── Types inlinés (originellement dans MonitorScreen / PainScoreEngine) ─────

export interface SessionAnnotation {
  id: string;
  sessionSec: number;
  timestamp: number;
  type: 'text' | 'voice';
  label: string;
  audioUri?: string;
  pspi: number;
}

/** Événement de douleur soudaine détecté par le moteur. */
export interface PainSpikeEvent {
  type: 'pain_spike';
  /** Timestamp (ms) au moment du pic */
  timestamp: number;
  /** Score juste avant la montée (< spikeLowThreshold) */
  scoreBefore: number;
  /** Score au moment du pic (> spikeHighThreshold) */
  scoreAfter: number;
  /** Durée de la montée en ms */
  deltaMs: number;
}

// ─── Point de douleur ─────────────────────────────────────────────────────────

export interface PainDataPoint {
  sessionSec: number;
  score: number;
}

// ─── Patient ──────────────────────────────────────────────────────────────────

export interface Patient {
  id: string;
  nom: string;
  prenom: string;
  /** ISO date string YYYY-MM-DD */
  dateNaissance?: string;
  notes?: string;
  /** Profil de calibration personnel (issu de CalibrationManager) */
  calibrationProfile?: CalibrationThresholds;
  createdAt: number; // timestamp ms
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  /** null → séance anonyme */
  patientId: string | null;
  /** Timestamp de début (ms) */
  date: number;
  /** Durée en secondes */
  duree: number;
  painScores: PainDataPoint[];
  painEvents: PainSpikeEvent[];
  annotations: SessionAnnotation[];
  moyennePSPI: number;
  maxPSPI: number;
}

// ─── Patient + dernière session (pour la liste) ───────────────────────────────

export interface PatientWithLastSession extends Patient {
  lastSessionDate: number | null;
  lastSessionPspi: number | null;
  sessionCount: number;
}

// ─── Consentement RGPD ────────────────────────────────────────────────────────

/**
 * Consentement patient enregistré conformément au RGPD Art. 9
 * (traitement de données de santé).
 *
 * La signature numérique est stockée sous forme de hash SHA-256
 * du tracé SVG ; le tracé brut n'est jamais persisté.
 */
export interface PatientConsent {
  /** UUID du consentement */
  id: string;
  /** FK → patients.id */
  patientId: string;
  /** Timestamp de signature (ms) */
  timestamp: number;
  /** Version du formulaire (ex. '1.0') — permet de redemander si le formulaire évolue */
  version: string;
  /** SHA-256 hex du path SVG de signature */
  signatureHash: string;
}
