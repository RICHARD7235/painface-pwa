/**
 * DatabaseService – IndexedDB via Dexie.js pour PainFace PWA.
 *
 * Tables :
 *   patients         – profils patients avec profil de calibration optionnel
 *   sessions         – séances avec scores bruts, événements et annotations
 *   patientConsents  – consentements RGPD (Art. 9) par patient
 *
 * Toutes les opérations sont async (API Dexie).
 * Mêmes noms de fonctions que la version SQLite pour compatibilité.
 */

import Dexie, { type Table } from 'dexie';
import type {
  Patient,
  Session,
  PatientWithLastSession,
  PatientConsent,
} from '../types/patient';

// ─── Dexie Database ──────────────────────────────────────────────────────────

class PainFaceDB extends Dexie {
  patients!: Table<Patient>;
  sessions!: Table<Session>;
  patientConsents!: Table<PatientConsent>;

  constructor() {
    super('painface');
    this.version(1).stores({
      patients: 'id, nom, prenom, createdAt',
      sessions: 'id, patientId, date',
      patientConsents: 'id, patientId, timestamp',
    });
  }
}

const db = new PainFaceDB();

// ─── PATIENTS ────────────────────────────────────────────────────────────────

export async function getAllPatients(): Promise<PatientWithLastSession[]> {
  const patients = await db.patients.orderBy('nom').toArray();
  const sessions = await db.sessions.toArray();

  return patients.map((p) => {
    const patientSessions = sessions.filter((s) => s.patientId === p.id);
    const sorted = patientSessions.sort((a, b) => b.date - a.date);
    const last = sorted[0];
    const avgPspi =
      patientSessions.length > 0
        ? patientSessions.reduce((sum, s) => sum + s.moyennePSPI, 0) /
          patientSessions.length
        : null;

    return {
      ...p,
      lastSessionDate: last?.date ?? null,
      lastSessionPspi: avgPspi,
      sessionCount: patientSessions.length,
    };
  }).sort((a, b) => {
    if (a.lastSessionDate && b.lastSessionDate)
      return b.lastSessionDate - a.lastSessionDate;
    if (a.lastSessionDate) return -1;
    if (b.lastSessionDate) return 1;
    return a.nom.localeCompare(b.nom);
  });
}

export async function getPatientById(id: string): Promise<Patient | null> {
  return (await db.patients.get(id)) ?? null;
}

export async function insertPatient(patient: Patient): Promise<void> {
  await db.patients.add(patient);
}

export async function updatePatient(patient: Patient): Promise<void> {
  await db.patients.put(patient);
}

export async function deletePatient(id: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.patients], async () => {
    await db.sessions.where('patientId').equals(id).delete();
    await db.patients.delete(id);
  });
}

/**
 * Suppression RGPD complète (Art. 17 – droit à l'oubli).
 * Supprime : consentements, sessions, profil patient.
 */
export async function deletePatientAll(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.patientConsents, db.sessions, db.patients],
    async () => {
      await db.patientConsents.where('patientId').equals(id).delete();
      await db.sessions.where('patientId').equals(id).delete();
      await db.patients.delete(id);
    },
  );
}

// ─── SESSIONS ─────────────────────────────────────────────────────────────────

export async function getSessionsByPatient(
  patientId: string,
): Promise<Session[]> {
  return db.sessions
    .where('patientId')
    .equals(patientId)
    .reverse()
    .sortBy('date');
}

export async function getSessionById(id: string): Promise<Session | null> {
  return (await db.sessions.get(id)) ?? null;
}

export async function insertSession(session: Session): Promise<void> {
  await db.sessions.add(session);
}

export async function deleteSession(id: string): Promise<void> {
  await db.sessions.delete(id);
}

export async function getRecentSessions(
  limit = 20,
): Promise<(Session & { patientNom?: string })[]> {
  const sessions = await db.sessions.orderBy('date').reverse().limit(limit).toArray();
  const patientIds = [...new Set(sessions.map((s) => s.patientId).filter(Boolean))];
  const patients = await db.patients.bulkGet(patientIds as string[]);
  const patientMap = new Map(
    patients.filter(Boolean).map((p) => [p!.id, `${p!.nom} ${p!.prenom}`]),
  );

  return sessions.map((s) => ({
    ...s,
    patientNom: s.patientId ? patientMap.get(s.patientId) : undefined,
  }));
}

// ─── CONSENTEMENTS RGPD ───────────────────────────────────────────────────────

export async function insertConsent(consent: PatientConsent): Promise<void> {
  await db.patientConsents.put(consent);
}

export async function getConsentByPatient(
  patientId: string,
): Promise<PatientConsent | null> {
  const consents = await db.patientConsents
    .where('patientId')
    .equals(patientId)
    .reverse()
    .sortBy('timestamp');
  return consents[0] ?? null;
}

export async function hasConsent(patientId: string): Promise<boolean> {
  return (await getConsentByPatient(patientId)) !== null;
}

export async function deleteConsentByPatient(
  patientId: string,
): Promise<void> {
  await db.patientConsents.where('patientId').equals(patientId).delete();
}
