'use client';

/**
 * PatientsPage -- Liste des patients avec recherche et ajout.
 * Theme: Clinical / éditorial — ivory + ink + clinical blue.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getAllPatients,
  insertPatient,
  deletePatient,
} from '../../services/DatabaseService';
import type { PatientWithLastSession } from '../../types/patient';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pspiHex(score: number): string {
  if (score <= 4) return 'var(--color-pspi-green)';
  if (score <= 8) return 'var(--color-pspi-amber)';
  return 'var(--color-pspi-rose)';
}

function relativeLabel(ts: number): string {
  const diffH = (Date.now() - ts) / 3_600_000;
  if (diffH < 1) return `${Math.max(1, Math.round(diffH * 60))} min`;
  if (diffH < 24) return `${Math.round(diffH)} h`;
  const diffD = diffH / 24;
  if (diffD < 7) return `${Math.round(diffD)} j.`;
  return `${Math.round(diffD / 7)} sem.`;
}

// ── AddPatientModal ──────────────────────────────────────────────────────────

interface AddPatientModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (patientId: string) => void;
}

const inputClasses =
  'mb-3 w-full rounded-xl border border-[var(--color-ink-15)] bg-[var(--color-paper)] px-4 py-3 text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-50)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30 transition-colors';

function AddPatientModal({ visible, onClose, onSaved }: AddPatientModalProps) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setNom('');
      setPrenom('');
      setDateNaissance('');
      setNotes('');
    }
  }, [visible]);

  async function handleSave() {
    if (!nom.trim() || !prenom.trim()) {
      alert('Veuillez saisir le nom et le prénom.');
      return;
    }
    setSaving(true);
    try {
      const newId = crypto.randomUUID();
      await insertPatient({
        id: newId,
        nom: nom.trim(),
        prenom: prenom.trim(),
        dateNaissance: dateNaissance.trim() || undefined,
        notes: notes.trim() || undefined,
        createdAt: Date.now(),
      });
      onSaved(newId);
    } catch (e) {
      alert('Impossible de créer le patient.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-ink)]/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-3xl border-t border-[var(--color-ink-08)] bg-[var(--color-ivory)] p-6 pb-8 animate-slide-up">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--color-ink-15)]" />
        <h2
          className="mb-5 text-[var(--color-ink)]"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 26, letterSpacing: '-0.3px', lineHeight: 1 }}
        >
          Nouveau patient
        </h2>

        <input
          type="text"
          placeholder="Prénom *"
          className={inputClasses}
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          autoCapitalize="words"
        />
        <input
          type="text"
          placeholder="Nom *"
          className={inputClasses}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          style={{ textTransform: 'uppercase' }}
        />
        <input
          type="text"
          placeholder="Date de naissance (JJ/MM/AAAA)"
          className={inputClasses}
          value={dateNaissance}
          onChange={(e) => setDateNaissance(e.target.value)}
        />
        <textarea
          placeholder="Notes (optionnel)"
          rows={3}
          className={`${inputClasses} resize-none`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[var(--color-ink-15)] bg-transparent py-3.5 text-[14px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-paper-alt)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] rounded-xl bg-[var(--color-ink)] py-3.5 text-[14px] font-medium text-[var(--color-ivory)] transition-all disabled:opacity-50"
          >
            {saving ? 'Création...' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PatientRow ───────────────────────────────────────────────────────────────

interface PatientRowProps {
  patient: PatientWithLastSession;
  onDelete: () => void;
}

function PatientRow({ patient, onDelete }: PatientRowProps) {
  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const ok = window.confirm(
      `Supprimer ${patient.prenom} ${patient.nom} et toutes ses séances ?`,
    );
    if (ok) onDelete();
  }

  const initiales =
    (patient.prenom[0] ?? '').toUpperCase() + (patient.nom[0] ?? '').toUpperCase();

  return (
    <Link
      href={`/patients/${patient.id}`}
      className="flex items-center gap-3.5 px-5 py-3.5 no-underline"
      style={{ borderBottom: '1px solid var(--color-ink-rule)' }}
      onContextMenu={handleContextMenu}
    >
      <div
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--color-paper-alt)] text-[var(--color-ink)]"
        style={{
          border: '1px solid var(--color-ink-08)',
          fontFamily: 'var(--font-serif)',
          fontSize: 16,
        }}
      >
        {initiales}
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="text-[15px] font-medium text-[var(--color-ink)]"
          style={{ letterSpacing: '-0.2px' }}
        >
          {patient.prenom}{' '}
          <span className="font-normal text-[var(--color-ink-50)]">{patient.nom}</span>
        </div>
        <div className="mt-[2px] flex items-center gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
          <span className="text-[11px] text-[var(--color-ink-50)]">
            {patient.sessionCount} séance{patient.sessionCount > 1 ? 's' : ''}
          </span>
          {patient.lastSessionDate != null && (
            <>
              <span className="text-[11px] text-[var(--color-ink-30)]">·</span>
              <span className="text-[11px] text-[var(--color-ink-50)]">
                dernière {relativeLabel(patient.lastSessionDate)}
              </span>
            </>
          )}
        </div>
      </div>

      {patient.lastSessionPspi != null && (
        <div className="text-right">
          <div
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 22,
              color: pspiHex(patient.lastSessionPspi),
              lineHeight: 1,
              letterSpacing: '-0.01em',
            }}
          >
            {patient.lastSessionPspi.toFixed(1)}
          </div>
          <div
            className="mt-[2px] text-[9px] uppercase text-[var(--color-ink-30)]"
            style={{ letterSpacing: '0.1em' }}
          >
            PSPI moy
          </div>
        </div>
      )}
    </Link>
  );
}

// ── PatientsPage ─────────────────────────────────────────────────────────────

export default function PatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientWithLastSession[]>([]);
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'active' | 'archived'>('all');

  const loadPatients = useCallback(async () => {
    try {
      const list = await getAllPatients();
      setPatients(list);
    } catch (e) {
      console.error('[PatientsPage] loadPatients:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadPatients();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadPatients]);

  const filtered = useMemo(() => {
    const base = query.trim()
      ? patients.filter((p) =>
          `${p.prenom} ${p.nom}`.toLowerCase().includes(query.toLowerCase()),
        )
      : patients;
    if (tab === 'active') {
      return base.filter(
        (p) => p.lastSessionDate != null && Date.now() - p.lastSessionDate < 7 * 86_400_000,
      );
    }
    return base;
  }, [patients, query, tab]);

  const activeCount = useMemo(
    () =>
      patients.filter(
        (p) => p.lastSessionDate != null && Date.now() - p.lastSessionDate < 7 * 86_400_000,
      ).length,
    [patients],
  );

  async function handleDelete(id: string) {
    try {
      await deletePatient(id);
      navigator.vibrate?.(10);
      await loadPatients();
    } catch {
      alert('Impossible de supprimer le patient.');
    }
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-auto bg-[var(--color-ivory)]">
      {/* Editorial top bar */}
      <div className="px-5 pt-3 pb-3">
        <h1
          className="text-[var(--color-ink)]"
          style={{ fontFamily: 'var(--font-serif)', fontSize: 32, letterSpacing: '-0.4px', lineHeight: 1 }}
        >
          Patients
        </h1>
        <p className="mt-2 text-[12.5px] text-[var(--color-ink-50)]">
          {patients.length} dossier{patients.length > 1 ? 's' : ''} · {activeCount} actif
          {activeCount > 1 ? 's' : ''} cette semaine
        </p>
      </div>

      {/* Search */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2.5 rounded-full bg-[var(--color-paper)] px-4 py-2.5"
             style={{ border: '1px solid var(--color-ink-08)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-ink-50)]">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
          <input
            type="search"
            placeholder="Rechercher un patient"
            className="flex-1 bg-transparent text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-50)] outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Segmented tabs */}
      <div
        className="flex gap-5 px-5 pb-0"
        style={{ borderBottom: '1px solid var(--color-ink-rule)' }}
      >
        {(
          [
            ['all', 'Tous', patients.length],
            ['active', 'Actifs', activeCount],
            ['archived', 'Archivés', 0],
          ] as const
        ).map(([key, label, count]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="pb-2.5 pt-2.5 text-[13px]"
              style={{
                fontWeight: 500,
                color: active ? 'var(--color-ink)' : 'var(--color-ink-50)',
                borderBottom: active ? '2px solid var(--color-ink)' : '2px solid transparent',
              }}
            >
              {label}
              <span className="ml-1.5 text-[var(--color-ink-30)]">{count}</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="flex-1 pb-24">
        {loading ? (
          <div className="flex flex-col items-center pt-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-ink-15)] border-t-[var(--color-ink)]" />
            <p className="mt-4 text-sm text-[var(--color-ink-50)]">Chargement...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center pt-16 px-5 text-center">
            <p
              className="text-[17px] text-[var(--color-ink)]"
              style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.3px' }}
            >
              {query ? 'Aucun patient trouvé' : 'Aucun patient enregistré'}
            </p>
            {!query && (
              <p className="mt-2 text-[13px] text-[var(--color-ink-50)]">
                Appuyez sur + pour ajouter un patient
              </p>
            )}
          </div>
        ) : (
          <div>
            {filtered.map((patient) => (
              <PatientRow
                key={patient.id}
                patient={patient}
                onDelete={() => handleDelete(patient.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB — dark ink pill */}
      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className="fixed bottom-7 right-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--color-ink)] text-[var(--color-ivory)] transition-all active:scale-95"
        style={{ boxShadow: '0 10px 28px rgba(20,23,28,0.25)' }}
        aria-label="Ajouter un patient"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <AddPatientModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={async (patientId) => {
          setShowAdd(false);
          await loadPatients();
          router.push(`/consent/${patientId}`);
        }}
      />
    </div>
  );
}
