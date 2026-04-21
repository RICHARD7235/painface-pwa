'use client';

/**
 * PatientDetailPage -- Profil patient, historique des séances et graphe PSPI.
 * Clinical / éditorial theme.
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

function formatDateLong(ts: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts));
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function pspiHex(score: number): string {
  if (score <= 4) return 'var(--color-pspi-green)';
  if (score <= 8) return 'var(--color-pspi-amber)';
  return 'var(--color-pspi-rose)';
}

function pspiLabel(score: number): string {
  if (score === 0) return 'Absent';
  if (score <= 4) return 'Léger';
  if (score <= 8) return 'Modéré';
  if (score <= 12) return 'Intense';
  return 'Sévère';
}

// ── PspiEvolutionChart ───────────────────────────────────────────────────────

function PspiEvolutionChart({ sessions }: { sessions: Session[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(330);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const W = width;
  const H = 70;

  const sorted = [...sessions].reverse();
  if (sorted.length < 2) {
    return (
      <div ref={containerRef} className="py-4 text-center text-[13px] text-[var(--color-ink-50)]">
        Minimum 2 séances pour afficher la courbe
      </div>
    );
  }

  const n = sorted.length;
  const toX = (i: number) => (i / (n - 1)) * W;
  const toY = (v: number) => H - (v / 16) * (H - 10) - 4;

  const linePts = sorted.map((s, i) => `${toX(i).toFixed(1)} ${toY(s.moyennePSPI).toFixed(1)}`).join(' L ');
  const areaPts =
    `M 0 ${H} L ` +
    sorted.map((s, i) => `${toX(i).toFixed(1)} ${toY(s.moyennePSPI).toFixed(1)}`).join(' L ') +
    ` L ${W} ${H} Z`;

  const lastColor = pspiHex(sorted[n - 1]!.moyennePSPI);

  return (
    <div ref={containerRef}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="pg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={lastColor} stopOpacity="0.18" />
            <stop offset="1" stopColor={lastColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPts} fill="url(#pg)" />
        <path d={`M ${linePts}`} stroke={lastColor} strokeWidth={1.25} fill="none" />
        <line x1="0" y1={toY(8)} x2={W} y2={toY(8)} stroke="var(--color-ink-15)" strokeDasharray="2 3" strokeWidth={0.6} />
        <line x1="0" y1={toY(4)} x2={W} y2={toY(4)} stroke="var(--color-ink-15)" strokeDasharray="2 3" strokeWidth={0.6} />
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

  useEffect(() => {
    setNom(patient.nom);
    setPrenom(patient.prenom);
    setDateNaissance(patient.dateNaissance ?? '');
    setNotes(patient.notes ?? '');
  }, [patient]);

  async function handleSave() {
    if (!nom.trim() || !prenom.trim()) {
      alert('Veuillez saisir le nom et le prénom.');
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
      alert('Impossible de mettre à jour le patient.');
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  const inputClass =
    'mb-2.5 w-full rounded-xl border border-[var(--color-ink-15)] bg-[var(--color-paper)] px-4 py-3 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-50)] focus:border-[var(--color-accent)] focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl border-t border-[var(--color-ink-08)] bg-[var(--color-ivory)] p-6 pb-8 animate-slide-up">
        <h2
          className="mb-4 text-[var(--color-ink)]"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 24, letterSpacing: '-0.3px' }}
        >
          Modifier le patient
        </h2>
        <input type="text" placeholder="Prénom *" className={inputClass} value={prenom} onChange={(e) => setPrenom(e.target.value)} />
        <input type="text" placeholder="Nom *" className={inputClass} value={nom} onChange={(e) => setNom(e.target.value)} style={{ textTransform: 'uppercase' }} />
        <input type="text" placeholder="Date de naissance (JJ/MM/AAAA)" className={inputClass} value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} />
        <textarea placeholder="Notes (optionnel)" rows={3} className={`${inputClass} resize-none`} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="mt-2 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--color-ink-15)] py-3.5 text-[14px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-paper-alt)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] rounded-xl bg-[var(--color-ink)] py-3.5 text-[14px] font-medium text-[var(--color-ivory)] transition-all disabled:opacity-50"
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
  const color = pspiHex(session.moyennePSPI);
  const maxColor = pspiHex(session.maxPSPI);

  return (
    <Link
      href={`/session/${session.id}`}
      className="flex items-center gap-3.5 px-5 py-3 no-underline"
      style={{ borderTop: '1px solid var(--color-ink-rule)' }}
    >
      <div className="h-8 w-[4px] rounded-sm" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-[var(--color-ink)]" style={{ letterSpacing: '-0.1px' }}>
          {formatDateLong(session.date)}
        </div>
        <div className="text-[11px] text-[var(--color-ink-50)]" style={{ fontFamily: 'var(--font-mono)' }}>
          durée {formatDuration(session.duree)}
          {session.painEvents.length > 0
            ? ` · ${session.painEvents.length} pic${session.painEvents.length > 1 ? 's' : ''}`
            : ''}
        </div>
      </div>
      <div className="mr-2.5 text-right">
        <div className="text-[9px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: '0.08em' }}>moy</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color, lineHeight: 1 }}>
          {session.moyennePSPI.toFixed(1)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[9px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: '0.08em' }}>max</div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: maxColor, lineHeight: 1 }}>
          {session.maxPSPI.toFixed(1)}
        </div>
      </div>
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
      `Supprimer ${patient.prenom} ${patient.nom} et toutes ses séances ?`,
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

  async function handleGdprErase() {
    if (!patient) return;
    const ok1 = window.confirm(
      `Effacement complet (RGPD Art. 17)\n\n` +
        `Supprimer TOUTES les données de ${patient.prenom} ${patient.nom} :\n` +
        `- Profil patient\n- Toutes les séances\n- Consentement\n\n` +
        `Cette action est irréversible.`,
    );
    if (!ok1) return;
    const ok2 = window.confirm(
      'Confirmation finale\n\nÊtes-vous certain(e) ? Cette opération ne peut pas être annulée.',
    );
    if (!ok2) return;
    try {
      await deletePatientAll(patient.id);
      navigator.vibrate?.(10);
      router.back();
    } catch (e) {
      alert("Impossible d'effacer les données.");
      console.error('[PatientDetailPage] GDPR erase:', e);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--color-ivory)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-15)] border-t-[var(--color-ink)]" />
        <p className="mt-3 text-[13px] text-[var(--color-ink-50)]">Chargement...</p>
      </div>
    );
  }

  if (!patient) return null;

  const avgPspi =
    sessions.length > 0
      ? sessions.reduce((sum, s) => sum + s.moyennePSPI, 0) / sessions.length
      : null;
  const maxPspi = sessions.length > 0 ? Math.max(...sessions.map((s) => s.maxPSPI)) : null;

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-[var(--color-ivory)]">
      {/* Top bar — retour + title */}
      <div className="px-5 pt-3 pb-2">
        <div className="flex h-8 items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 text-[var(--color-ink-70)] text-[14px]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span>Retour</span>
          </button>
        </div>
        <h1
          className="mt-2 text-[var(--color-ink)]"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 32, letterSpacing: '-0.4px', lineHeight: 1 }}
        >
          {patient.prenom} {patient.nom}
        </h1>
        <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-50)]">
          {patient.dateNaissance ? `Né(e) le ${patient.dateNaissance} · ` : ''}
          {sessions.length} séance{sessions.length > 1 ? 's' : ''}
          {patient.notes ? ` · ${patient.notes}` : ''}
        </p>
      </div>

      {/* Hero card — PSPI moyen + Max */}
      <div
        className="mx-5 mt-2 rounded-[20px] bg-[var(--color-paper)] p-5"
        style={{ border: '1px solid var(--color-ink-08)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: '0.12em', fontWeight: 500 }}>
              PSPI moyen · {sessions.length} séance{sessions.length > 1 ? 's' : ''}
            </span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 56,
                  color: avgPspi != null ? pspiHex(avgPspi) : 'var(--color-ink-30)',
                  lineHeight: 0.95,
                  letterSpacing: '-0.01em',
                }}
              >
                {avgPspi != null ? avgPspi.toFixed(1) : '--'}
              </span>
              <span className="text-[12px] text-[var(--color-ink-50)]" style={{ fontFamily: 'var(--font-mono)' }}>/16</span>
            </div>
            {avgPspi != null && (
              <div className="mt-1.5 text-[13px]" style={{ color: pspiHex(avgPspi) }}>
                {pspiLabel(avgPspi)}
              </div>
            )}
          </div>

          {maxPspi != null && (
            <div className="text-right">
              <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: '0.12em', fontWeight: 500 }}>
                Plus haut
              </span>
              <div className="mt-1.5" style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: pspiHex(maxPspi), lineHeight: 1 }}>
                {maxPspi.toFixed(1)}
              </div>
            </div>
          )}
        </div>

        {sessions.length >= 2 && (
          <div className="mt-4">
            <PspiEvolutionChart sessions={sessions} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-2.5 px-5">
        <Link
          href={`/camera?patientId=${patient.id}`}
          className="flex-1 rounded-[14px] bg-[var(--color-ink)] py-3 text-center text-[14px] font-medium text-[var(--color-ivory)] no-underline"
          style={{ letterSpacing: '-0.1px' }}
        >
          Nouvelle séance
        </Link>
        <Link
          href={`/consent/${patient.id}`}
          className="flex-1 rounded-[14px] border border-[var(--color-ink-15)] bg-transparent py-3 text-center text-[14px] font-medium text-[var(--color-ink)] no-underline"
          style={{ letterSpacing: '-0.1px' }}
        >
          Consentement
        </Link>
      </div>

      {/* Consent badge */}
      <div className="mx-5 mt-3">
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5 w-fit"
          style={{
            background: consentOk ? 'rgba(76,124,91,0.08)' : 'rgba(182,122,31,0.08)',
            border: `1px solid ${consentOk ? 'rgba(76,124,91,0.25)' : 'rgba(182,122,31,0.28)'}`,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: consentOk ? 'var(--color-pspi-green)' : 'var(--color-pspi-amber)' }}
          />
          <span
            className="text-[10.5px] uppercase"
            style={{
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
              color: consentOk ? 'var(--color-pspi-green)' : 'var(--color-pspi-amber)',
            }}
          >
            {consentOk ? 'Consentement RGPD signé' : 'Consentement manquant'}
          </span>
        </div>
      </div>

      {/* Séances récentes */}
      <div className="mt-5 px-7">
        <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: '0.12em', fontWeight: 500 }}>
          Séances récentes
        </span>
      </div>
      <div className="mt-2">
        {sessions.length === 0 ? (
          <div className="mx-5 rounded-[14px] border border-[var(--color-ink-08)] bg-[var(--color-paper)] px-6 py-8 text-center">
            <p className="text-[13px] text-[var(--color-ink-50)]">
              Aucune séance enregistrée
            </p>
          </div>
        ) : (
          sessions.map((s) => <SessionRow key={s.id} session={s} />)
        )}
      </div>

      {/* Calibration profile */}
      {patient.calibrationProfile && (
        <div className="mx-5 mt-5 rounded-[14px] border border-[var(--color-ink-08)] bg-[var(--color-paper)] p-4">
          <div className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: '0.12em', fontWeight: 500 }}>
            Profil de calibration
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {Object.entries(patient.calibrationProfile).map(([au, data]) => (
              <div
                key={au}
                className="rounded-[10px] border border-[var(--color-ink-08)] bg-[var(--color-ivory)] p-2 text-center"
              >
                <p className="text-[10px] font-medium text-[var(--color-accent-ink)]" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
                  {au.toUpperCase()}
                </p>
                <p className="text-[11px] text-[var(--color-ink-50)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  base:{' '}
                  {typeof data === 'object' && data && 'baseline' in data
                    ? (data as { baseline: number }).baseline.toFixed(3)
                    : '-'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Secondary actions */}
      <div className="mt-5 px-5 flex gap-2.5">
        <button
          type="button"
          onClick={() => setShowEdit(true)}
          className="flex-1 rounded-[12px] border border-[var(--color-ink-15)] bg-transparent py-2.5 text-[13px] font-medium text-[var(--color-ink)]"
        >
          Modifier
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="flex-1 rounded-[12px] border border-[var(--color-pspi-rose)]/30 bg-[var(--color-pspi-rose)]/5 py-2.5 text-[13px] font-medium text-[var(--color-pspi-rose)]"
        >
          Supprimer
        </button>
      </div>

      {/* Disclaimer */}
      <div className="mx-5 mt-5 rounded-[14px] bg-[var(--color-paper)] p-4" style={{ border: '1px solid var(--color-ink-08)' }}>
        <p className="text-[11.5px] leading-[1.5] text-[var(--color-ink-70)]">
          <strong className="text-[var(--color-ink)]">Avertissement :</strong> PainFace est un outil d&apos;aide
          à l&apos;observation. Il ne constitue pas un dispositif médical et ne remplace pas l&apos;évaluation
          clinique d&apos;un professionnel de santé.
        </p>
      </div>

      {/* Droit à l'oubli */}
      <div className="px-5 pb-8 pt-4">
        <button
          type="button"
          onClick={handleGdprErase}
          className="w-full rounded-[12px] border border-[var(--color-pspi-rose)]/30 bg-transparent py-3 text-[12.5px] font-medium text-[var(--color-pspi-rose)]/80 hover:bg-[var(--color-pspi-rose)]/5 transition-colors"
        >
          Supprimer toutes les données (RGPD Art. 17)
        </button>
      </div>

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
