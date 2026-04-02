'use client';

/**
 * PatientsPage -- Liste des patients avec recherche et ajout.
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
  if (score <= 4) return 'text-green-600';
  if (score <= 8) return 'text-amber-600';
  return 'text-red-600';
}

// ── AddPatientModal ──────────────────────────────────────────────────────────

interface AddPatientModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (patientId: string) => void;
}

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
      alert('Veuillez saisir le nom et le prenom.');
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
      alert('Impossible de creer le patient.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 pb-8 animate-in slide-in-from-bottom">
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          Nouveau patient
        </h2>

        <input
          type="text"
          placeholder="Prenom *"
          className="mb-2.5 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          autoCapitalize="words"
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
            {saving ? 'Creation...' : 'Creer'}
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
      `Supprimer ${patient.prenom} ${patient.nom} et toutes ses seances ?`,
    );
    if (ok) onDelete();
  }

  return (
    <Link
      href={`/patients/${patient.id}`}
      className="flex items-center bg-white px-4 py-3.5 hover:bg-slate-50 transition-colors group"
      onContextMenu={handleContextMenu}
    >
      {/* Avatar initiales */}
      <div className="mr-3.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100">
        <span className="text-base font-bold text-indigo-600">
          {(patient.prenom[0] ?? '') + (patient.nom[0] ?? '')}
        </span>
      </div>

      {/* Infos */}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-slate-800 truncate">
          {patient.prenom} {patient.nom}
        </p>
        {patient.lastSessionDate ? (
          <p className="text-xs text-slate-500">
            Derniere seance : {formatDate(patient.lastSessionDate)}
          </p>
        ) : (
          <p className="text-xs text-slate-500">Aucune seance</p>
        )}
        <p className="text-xs text-slate-500">
          {patient.sessionCount} seance{patient.sessionCount > 1 ? 's' : ''}
        </p>
      </div>

      {/* PSPI moyen */}
      {patient.lastSessionPspi != null && (
        <div className="mr-2.5 flex flex-col items-center">
          <span className={`text-lg font-bold ${pspiColor(patient.lastSessionPspi)}`}>
            {patient.lastSessionPspi.toFixed(1)}
          </span>
          <span className="text-[9px] uppercase text-slate-400">
            PSPI moy.
          </span>
        </div>
      )}

      {/* Chevron */}
      <span className="text-xl text-slate-400 group-hover:text-slate-600 transition-colors">
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
    <div className="relative flex min-h-screen flex-col bg-slate-50">
      {/* Barre de recherche */}
      <div className="border-b border-slate-200 bg-white px-4 py-2.5">
        <input
          type="search"
          placeholder="Rechercher un patient..."
          className="w-full rounded-lg bg-slate-100 px-3.5 py-2.5 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Liste */}
      <div className="flex-1">
        {loading ? (
          <div className="flex flex-col items-center pt-12">
            <p className="text-sm text-slate-400">Chargement...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center pt-12">
            <span className="mb-3 text-5xl">&#128100;</span>
            <p className="text-[17px] font-semibold text-slate-600">
              {query ? 'Aucun patient trouve' : 'Aucun patient enregistre'}
            </p>
            {!query && (
              <p className="mt-1.5 text-sm text-slate-400">
                Appuyez sur + pour ajouter un patient
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
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
        className="fixed bottom-7 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/35 hover:bg-indigo-700 active:scale-95 transition-all"
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
