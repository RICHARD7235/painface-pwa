'use client';

/**
 * PatientsPage -- Liste des patients avec recherche et ajout.
 * Theme: Premium Dark Medical Tech
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  getAllPatients,
  insertPatient,
  deletePatient,
} from '../../services/DatabaseService';
import type { PatientWithLastSession } from '../../types/patient';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(ts));
}

function pspiColor(score: number): string {
  if (score <= 4) return 'text-emerald-400';
  if (score <= 8) return 'text-amber-400';
  return 'text-red-400';
}

// ── AddPatientModal ──────────────────────────────────────────────────────────

interface AddPatientModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (patientId: string) => void;
}

const inputClasses =
  'mb-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 py-3 text-[15px] text-white placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-colors';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-2xl border-t border-white/[0.08] bg-[#111827] p-6 pb-8 animate-in slide-in-from-bottom">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/[0.12]" />
        <h2 className="mb-5 text-lg font-bold text-white">
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
            className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] py-3.5 text-[15px] font-semibold text-slate-400 hover:bg-white/[0.08] transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-[2] rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-indigo-600/20 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 transition-all"
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

  return (
    <Link
      href={`/patients/${patient.id}`}
      className="group flex items-center rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5 transition-all hover:bg-white/[0.06] hover:border-white/[0.10]"
      onContextMenu={handleContextMenu}
    >
      {/* Avatar initiales */}
      <div className="mr-3.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-md shadow-indigo-500/20">
        <span className="text-sm font-bold text-white">
          {(patient.prenom[0] ?? '').toUpperCase() + (patient.nom[0] ?? '').toUpperCase()}
        </span>
      </div>

      {/* Infos */}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-white truncate">
          {patient.prenom} {patient.nom}
        </p>
        {patient.lastSessionDate ? (
          <p className="text-xs text-slate-400">
            Dernière séance : {formatDate(patient.lastSessionDate)}
          </p>
        ) : (
          <p className="text-xs text-slate-500">Aucune séance</p>
        )}
        <p className="text-xs text-slate-500">
          {patient.sessionCount} séance{patient.sessionCount > 1 ? 's' : ''}
        </p>
      </div>

      {/* PSPI moyen */}
      {patient.lastSessionPspi != null && (
        <div className="mr-3 flex flex-col items-center">
          <span className={`text-lg font-bold ${pspiColor(patient.lastSessionPspi)}`}>
            {patient.lastSessionPspi.toFixed(1)}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-slate-500">
            PSPI moy.
          </span>
        </div>
      )}

      {/* Chevron */}
      <span className="text-xl text-slate-600 group-hover:text-slate-400 transition-colors">
        &#8250;
      </span>
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

  // Chargement initial + rechargement quand la page redevient visible
  useEffect(() => {
    loadPatients();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadPatients();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, [loadPatients]);

  const filtered = query.trim()
    ? patients.filter((p) =>
        `${p.prenom} ${p.nom}`.toLowerCase().includes(query.toLowerCase()),
      )
    : patients;

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
    <div className="relative flex flex-1 flex-col overflow-auto bg-[#0a0e1a]">
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-2xl font-bold text-white">Patients</h1>
        <p className="mt-0.5 text-sm text-slate-400">
          Suivi de la douleur par reconnaissance faciale
        </p>
      </div>

      {/* Barre de recherche */}
      <div className="px-5 py-3">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="search"
            placeholder="Rechercher un patient..."
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-4 text-[15px] text-white placeholder:text-slate-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-colors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 px-5 pb-24">
        {loading ? (
          <div className="flex flex-col items-center pt-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-500" />
            <p className="mt-4 text-sm text-slate-500">Chargement...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center pt-16">
            <svg
              className="mb-4 h-16 w-16 text-slate-700"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
            <p className="text-[17px] font-semibold text-slate-500">
              {query ? 'Aucun patient trouvé' : 'Aucun patient enregistré'}
            </p>
            {!query && (
              <p className="mt-2 text-sm text-slate-600">
                Appuyez sur + pour ajouter un patient
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
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

      {/* FAB Ajouter */}
      <button
        type="button"
        onClick={() => setShowAdd(true)}
        className="fixed bottom-7 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-400 active:scale-95 transition-all"
        aria-label="Ajouter un patient"
      >
        <span className="text-3xl font-light leading-none">+</span>
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
