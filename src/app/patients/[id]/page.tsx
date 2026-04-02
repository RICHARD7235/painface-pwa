'use client';

/**
 * PatientDetailPage -- Profil patient, historique des seances et graphe PSPI.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  getPatientById,
  getSessionsByPatient,
  updatePatient,
  deletePatient,
  deletePatientAll,
  hasConsent,
} from '../../../services/DatabaseService';
import type { Patient, Session } from '../../../types/patient';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function pspiColor(score: number): string {
  if (score <= 4) return 'text-green-600';
  if (score <= 8) return 'text-amber-600';
  return 'text-red-600';
}

function pspiColorHex(score: number): string {
  if (score <= 4) return '#16a34a';
  if (score <= 8) return '#d97706';
  return '#dc2626';
}

function pspiLabel(score: number): string {
  if (score === 0) return 'Absent';
  if (score <= 4) return 'Leger';
  if (score <= 8) return 'Modere';
  if (score <= 12) return 'Intense';
  return 'Severe';
}

// ── PspiEvolutionChart ───────────────────────────────────────────────────────

function PspiEvolutionChart({ sessions }: { sessions: Session[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const W = width;
  const H = 100;
  const PL = 28;
  const PR = 12;
  const PT = 10;
  const PB = 20;
  const CW = W - PL - PR;
  const CH = H - PT - PB;

  // Sessions triees chronologiquement
  const sorted = [...sessions].reverse();
  if (sorted.length < 2) {
    return (
      <div ref={containerRef} className="py-6 text-center text-sm text-slate-400">
        Minimum 2 seances pour afficher le graphe
      </div>
    );
  }

  const MAX_PSPI = 16;
  const n = sorted.length;
  const toX = (i: number) => PL + (i / (n - 1)) * CW;
  const toY = (v: number) => PT + CH - (v / MAX_PSPI) * CH;

  const points = sorted
    .map((s, i) => `${toX(i).toFixed(1)},${toY(s.moyennePSPI).toFixed(1)}`)
    .join(' ');

  const gridVals = [4, 8, 12];

  return (
    <div ref={containerRef}>
      <svg width={W} height={H}>
        {/* Grid lines */}
        {gridVals.map((v) => (
          <line
            key={v}
            x1={PL} y1={toY(v)} x2={PL + CW} y2={toY(v)}
            stroke="#e2e8f0" strokeWidth={0.8} strokeDasharray="3,4"
          />
        ))}
        {/* Y labels */}
        {[0, 8, 16].map((v) => (
          <text key={v} x={PL - 3} y={toY(v) + 4} textAnchor="end" fontSize={8} fill="#94a3b8">
            {v}
          </text>
        ))}
        {/* Baseline */}
        <line x1={PL} y1={PT + CH} x2={PL + CW} y2={PT + CH} stroke="#e2e8f0" strokeWidth={0.8} />

        {/* Line */}
        <polyline
          points={points}
          fill="none" stroke="#4f46e5" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round"
        />

        {/* Dots */}
        {sorted.map((ss, i) => (
          <circle
            key={ss.id}
            cx={toX(i)} cy={toY(ss.moyennePSPI)} r={3.5}
            fill={pspiColorHex(ss.moyennePSPI)} stroke="#fff" strokeWidth={1.5}
          />
        ))}

        {/* X labels */}
        <text x={PL} y={H - 3} fontSize={8} fill="#94a3b8">
          {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(sorted[0]!.date))}
        </text>
        <text x={PL + CW} y={H - 3} textAnchor="end" fontSize={8} fill="#94a3b8">
          {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(sorted[n - 1]!.date))}
        </text>
      </svg>
    </div>
  );
}

// ── EditPatientModal ─────────────────────────────────────────────────────────

interface EditModalProps {
  visible: boolean;
  patient: Patient;
  onClose: () => void;
  onSaved: (updated: Patient) => void;
}

function EditPatientModal({ visible, patient, onClose, onSaved }: EditModalProps) {
  const [nom, setNom] = useState(patient.nom);
  const [prenom, setPrenom] = useState(patient.prenom);
  const [dateNaissance, setDateNaissance] = useState(patient.dateNaissance ?? '');
  const [notes, setNotes] = useState(patient.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Re-sync when patient changes
  useEffect(() => {
    setNom(patient.nom);
    setPrenom(patient.prenom);
    setDateNaissance(patient.dateNaissance ?? '');
    setNotes(patient.notes ?? '');
  }, [patient]);

  async function handleSave() {
    if (!nom.trim() || !prenom.trim()) {
      alert('Veuillez saisir le nom et le prenom.');
      return;
    }
    setSaving(true);
    const updated: Patient = {
      ...patient,
      nom: nom.trim(),
      prenom: prenom.trim(),
      dateNaissance: dateNaissance.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    try {
      await updatePatient(updated);
      onSaved(updated);
    } catch {
      alert('Impossible de mettre a jour le patient.');
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 pb-8">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          Modifier le patient
        </h2>
        <input
          type="text"
          placeholder="Prenom *"
          className="mb-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
        />
        <input
          type="text"
          placeholder="Nom *"
          className="mb-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          style={{ textTransform: 'uppercase' }}
        />
        <input
          type="text"
          placeholder="Date de naissance (JJ/MM/AAAA)"
          className="mb-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={dateNaissance}
          onChange={(e) => setDateNaissance(e.target.value)}
        />
        <textarea
          placeholder="Notes (optionnel)"
          rows={3}
          className="mb-2.5 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-2 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-100 py-3.5 text-[15px] font-semibold text-slate-500 hover:bg-slate-200 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] rounded-lg bg-indigo-600 py-3.5 text-[15px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SessionRow ───────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: Session }) {
  const color = pspiColor(session.moyennePSPI);
  const maxColor = pspiColor(session.maxPSPI);

  return (
    <Link
      href={`/session/${session.id}`}
      className="flex items-center border-t border-slate-100 bg-white px-4 py-3 hover:bg-slate-50 transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-slate-800">
          {formatDate(session.date)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {formatDuration(session.duree)}
          {' \u00b7 '}
          {session.annotations.length > 0
            ? `${session.annotations.length} annotation${session.annotations.length > 1 ? 's' : ''}`
            : 'Aucune annotation'}
          {session.painEvents.length > 0
            ? ` \u00b7 ${session.painEvents.length} spike${session.painEvents.length > 1 ? 's' : ''}`
            : ''}
        </p>
      </div>

      <div className="mr-2.5 flex gap-2.5">
        <div className="flex flex-col items-center">
          <span className={`text-base font-bold ${color}`}>
            {session.moyennePSPI.toFixed(1)}
          </span>
          <span className="text-[9px] uppercase text-slate-400">moy.</span>
        </div>
        <div className="flex flex-col items-center">
          <span className={`text-base font-bold ${maxColor}`}>
            {session.maxPSPI.toFixed(1)}
          </span>
          <span className="text-[9px] uppercase text-slate-400">max</span>
        </div>
      </div>

      <span className="text-xl text-slate-400">&#8250;</span>
    </Link>
  );
}

// ── PatientDetailPage ────────────────────────────────────────────────────────

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [consentOk, setConsentOk] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const p = await getPatientById(id);
      if (!p) {
        router.back();
        return;
      }
      setPatient(p);
      setSessions(await getSessionsByPatient(id));
      setConsentOk(await hasConsent(id));
    } catch (e) {
      console.error('[PatientDetailPage]', e);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadData();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadData]);

  async function handleDelete() {
    if (!patient) return;
    const ok = window.confirm(
      `Supprimer ${patient.prenom} ${patient.nom} et toutes ses seances ?`,
    );
    if (!ok) return;
    try {
      await deletePatient(patient.id);
      navigator.vibrate?.(10);
      router.back();
    } catch {
      alert('Impossible de supprimer le patient.');
    }
  }

  /** Droit a l'oubli RGPD Art. 17 -- suppression complete avec double confirmation */
  async function handleGdprErase() {
    if (!patient) return;
    const ok1 = window.confirm(
      `Effacement complet (RGPD Art. 17)\n\n` +
        `Supprimer TOUTES les donnees de ${patient.prenom} ${patient.nom} :\n` +
        `- Profil patient\n- Toutes les seances\n- Consentement\n\n` +
        `Cette action est irreversible.`,
    );
    if (!ok1) return;

    const ok2 = window.confirm(
      'Confirmation finale\n\nEtes-vous certain(e) ? Cette operation ne peut pas etre annulee.',
    );
    if (!ok2) return;

    try {
      await deletePatientAll(patient.id);
      navigator.vibrate?.(10);
      router.back();
    } catch (e) {
      alert("Impossible d'effacer les donnees.");
      console.error('[PatientDetailPage] GDPR erase:', e);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Chargement...</p>
      </div>
    );
  }

  if (!patient) return null;

  const avgPspi =
    sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.moyennePSPI, 0) / sessions.length
      : null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── En-tete patient ─────────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white px-5 pb-5 pt-7 text-center">
        <div className="mx-auto mb-2.5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-indigo-100">
          <span className="text-[26px] font-bold text-indigo-600">
            {(patient.prenom[0] ?? '') + (patient.nom[0] ?? '')}
          </span>
        </div>
        <h1 className="text-[22px] font-bold text-slate-800">
          {patient.prenom} {patient.nom}
        </h1>
        {patient.dateNaissance && (
          <p className="mt-0.5 text-sm text-slate-500">
            Ne(e) le {patient.dateNaissance}
          </p>
        )}
        {patient.notes && (
          <p className="mt-2 text-sm italic text-slate-600">
            {patient.notes}
          </p>
        )}

        {/* Badge consentement RGPD */}
        <div className="mt-2.5 inline-block rounded-full bg-slate-50 px-3 py-1">
          <span
            className={`text-xs font-semibold ${consentOk ? 'text-green-600' : 'text-amber-600'}`}
          >
            {consentOk
              ? '\u2713  Consentement RGPD recueilli'
              : '\u26a0  Consentement RGPD manquant'}
          </span>
        </div>

        {/* Bouton recueillir consentement (si absent) */}
        {!consentOk && (
          <div className="mt-2">
            <Link
              href={`/consent/${patient.id}`}
              className="inline-block rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
            >
              Recueillir le consentement
            </Link>
          </div>
        )}

        {/* Actions patient */}
        <div className="mt-4 flex justify-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="rounded-lg bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg bg-red-100 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-200 transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>

      {/* ── Stats globales ──────────────────────────────────────────── */}
      <div className="flex gap-3 border-b border-slate-200 bg-white p-4">
        <div className="flex flex-1 flex-col items-center rounded-lg bg-slate-50 p-3">
          <span className="text-[22px] font-bold text-slate-800">
            {sessions.length}
          </span>
          <span className="mt-0.5 text-[11px] uppercase text-slate-400">
            Seances
          </span>
        </div>
        {avgPspi != null && (
          <div className="flex flex-1 flex-col items-center rounded-lg bg-slate-50 p-3">
            <span className={`text-[22px] font-bold ${pspiColor(avgPspi)}`}>
              {avgPspi.toFixed(1)}
            </span>
            <span className="mt-0.5 text-[11px] uppercase text-slate-400">
              PSPI moyen
            </span>
          </div>
        )}
        {sessions.length > 0 && (
          <div className="flex flex-1 flex-col items-center rounded-lg bg-slate-50 p-3">
            <span
              className={`text-[22px] font-bold ${pspiColor(Math.max(...sessions.map((s) => s.maxPSPI)))}`}
            >
              {Math.max(...sessions.map((s) => s.maxPSPI)).toFixed(1)}
            </span>
            <span className="mt-0.5 text-[11px] uppercase text-slate-400">
              PSPI max
            </span>
          </div>
        )}
      </div>

      {/* ── Bouton demarrer seance ────────────────────────────────── */}
      <div className="p-4">
        <Link
          href={`/monitor?patientId=${patient.id}`}
          className="flex items-center justify-center rounded-xl bg-indigo-600 py-4 text-base font-bold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-700 transition-colors"
        >
          &#9654;  Demarrer une seance
        </Link>
      </div>

      {/* ── Graphe evolution ──────────────────────────────────────── */}
      {sessions.length >= 2 && (
        <div className="mt-2 border-y border-slate-200 bg-white">
          <h2 className="px-4 pb-2.5 pt-3.5 text-[13px] font-bold uppercase tracking-wide text-slate-500">
            Evolution PSPI moyen
          </h2>
          <div className="px-4 pb-4">
            <PspiEvolutionChart sessions={sessions} />
          </div>
        </div>
      )}

      {/* ── Historique seances ─────────────────────────────────────── */}
      <div className="mt-2 border-y border-slate-200 bg-white">
        <h2 className="px-4 pb-2.5 pt-3.5 text-[13px] font-bold uppercase tracking-wide text-slate-500">
          Seances ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <div className="px-6 py-6 text-center">
            <p className="text-sm text-slate-400">
              Aucune seance enregistree
            </p>
          </div>
        ) : (
          sessions.map((s) => <SessionRow key={s.id} session={s} />)
        )}
      </div>

      {/* ── Calibration profile ────────────────────────────────────── */}
      {patient.calibrationProfile && (
        <div className="mt-2 border-y border-slate-200 bg-white">
          <h2 className="px-4 pb-2.5 pt-3.5 text-[13px] font-bold uppercase tracking-wide text-slate-500">
            Profil de calibration
          </h2>
          <div className="grid grid-cols-3 gap-2 px-4 pb-4">
            {Object.entries(patient.calibrationProfile).map(([au, data]) => (
              <div key={au} className="rounded-lg bg-slate-50 p-2 text-center">
                <p className="text-xs font-bold uppercase text-slate-600">
                  {au}
                </p>
                <p className="text-[11px] text-slate-400">
                  base: {typeof data === 'object' && data && 'baseline' in data ? (data as { baseline: number }).baseline.toFixed(3) : '-'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Disclaimer medical ─────────────────────────────────────── */}
      <div className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-700">
          <strong>Avertissement medical :</strong> PainFace est un outil
          d&apos;aide a l&apos;observation. Il ne constitue pas un
          dispositif medical et ne remplace pas l&apos;evaluation clinique
          d&apos;un professionnel de sante.
        </p>
      </div>

      {/* ── Droit a l'oubli RGPD Art. 17 ──────────────────────────── */}
      <div className="px-4 pb-8 pt-4">
        <button
          type="button"
          onClick={handleGdprErase}
          className="w-full rounded-lg border border-red-300 bg-white py-3.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
        >
          Supprimer toutes les donnees (RGPD Art. 17)
        </button>
      </div>

      {/* ── Edit modal ─────────────────────────────────────────────── */}
      {patient && showEdit && (
        <EditPatientModal
          visible={showEdit}
          patient={patient}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setPatient(updated);
            setShowEdit(false);
          }}
        />
      )}
    </div>
  );
}
