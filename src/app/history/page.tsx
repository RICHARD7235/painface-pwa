"use client";

/**
 * HistoryPage – Dernières séances tous patients confondus.
 * Premium dark medical tech theme.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getRecentSessions, deleteSession } from "../../services/DatabaseService";
import type { Session } from "../../types/patient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  if (score <= 4) return "text-green-600";
  if (score <= 8) return "text-amber-600";
  return "text-red-600";
}

// ─── SessionRow ───────────────────────────────────────────────────────────────

interface RowProps {
  session: Session & { patientNom?: string };
  onDelete: (id: string) => void;
}

function SessionRow({ session, onDelete }: RowProps) {
  return (
    <div className="border border-white/[0.06] bg-white/[0.03] rounded-xl mb-3 flex items-center transition-colors hover:bg-white/[0.06]">
      <Link
        href={`/session/${session.id}`}
        className="flex flex-1 items-center px-4 py-3.5 min-w-0"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            {formatDateTime(session.date)}
          </p>
          <p className="text-[13px] font-medium text-slate-400 mt-0.5">
            {session.patientNom ?? "Séance anonyme"}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {formatDuration(session.duree)}
            {session.painEvents.length > 0
              ? ` \u00b7 ${session.painEvents.length} pic${session.painEvents.length > 1 ? "s" : ""}`
              : ""}
          </p>
        </div>
        <div className="flex gap-3 mr-2">
          <div className="text-center">
            <p className={`text-base font-bold ${pspiColor(session.moyennePSPI)}`}>
              {session.moyennePSPI.toFixed(1)}
            </p>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">moy.</p>
          </div>
          <div className="text-center">
            <p className={`text-base font-bold ${pspiColor(session.maxPSPI)}`}>
              {session.maxPSPI.toFixed(1)}
            </p>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">max</p>
          </div>
        </div>
        <span className="text-xl text-slate-600">{"\u203A"}</span>
      </Link>
      <button
        className="px-3 py-3.5 text-slate-600 hover:text-red-400 transition-colors"
        onClick={() => onDelete(session.id)}
        aria-label="Supprimer la séance"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

// ─── HistoryPage ──────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [sessions, setSessions] = useState<
    (Session & { patientNom?: string })[]
  >([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    try {
      const data = await getRecentSessions(50);
      setSessions(data);
    } catch (e) {
      console.error("[HistoryPage]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Supprimer cette séance ? Cette action est irréversible.")) return;
      try {
        await deleteSession(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
      } catch (e) {
        console.error("[HistoryPage] delete failed:", e);
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex flex-1 flex-col overflow-auto bg-[#0a0e1a] items-center justify-center min-h-[50vh]">
        <p className="text-slate-500 text-sm">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-[#0a0e1a]">
      <div className="max-w-2xl mx-auto w-full">
        <div className="px-4 py-6">
          <h1 className="text-xl font-bold text-white">Historique</h1>
          <p className="text-sm text-slate-400 mt-1">
            Dernières séances de monitoring
          </p>
        </div>

        <div className="px-4 pb-6">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center pt-16">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-[17px] font-semibold text-slate-500">
                Aucune séance enregistrée
              </p>
              <p className="text-sm text-slate-600 mt-1.5 text-center leading-relaxed">
                Les séances apparaîtront ici
                <br />
                après votre premier monitoring
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
