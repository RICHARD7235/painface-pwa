"use client";

/**
 * HistoryPage – Dernières séances tous patients confondus.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getRecentSessions } from "../../services/DatabaseService";
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
}

function SessionRow({ session }: RowProps) {
  return (
    <Link
      href={`/session/${session.id}`}
      className="flex items-center bg-white px-4 py-3.5 hover:bg-slate-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">
          {formatDateTime(session.date)}
        </p>
        <p className="text-[13px] font-medium text-indigo-600 mt-0.5">
          {session.patientNom ?? "Seance anonyme"}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {formatDuration(session.duree)}
          {session.painEvents.length > 0
            ? ` \u00b7 ${session.painEvents.length} spike${session.painEvents.length > 1 ? "s" : ""}`
            : ""}
        </p>
      </div>
      <div className="flex gap-2.5 mr-2">
        <div className="text-center">
          <p className={`text-base font-bold ${pspiColor(session.moyennePSPI)}`}>
            {session.moyennePSPI.toFixed(1)}
          </p>
          <p className="text-[9px] text-slate-400 uppercase">moy.</p>
        </div>
        <div className="text-center">
          <p className={`text-base font-bold ${pspiColor(session.maxPSPI)}`}>
            {session.maxPSPI.toFixed(1)}
          </p>
          <p className="text-[9px] text-slate-400 uppercase">max</p>
        </div>
      </div>
      <span className="text-xl text-slate-400">{"\u203A"}</span>
    </Link>
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <p className="text-slate-400 text-sm">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto">
        <div className="px-4 py-5">
          <h1 className="text-xl font-bold text-slate-800">Historique</h1>
          <p className="text-sm text-slate-500 mt-1">
            Dernieres seances de monitoring
          </p>
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center pt-16">
            <span className="text-5xl mb-3">&#x1F4CB;</span>
            <p className="text-[17px] font-semibold text-slate-600">
              Aucune seance enregistree
            </p>
            <p className="text-sm text-slate-400 mt-1.5 text-center leading-relaxed">
              Les seances apparaitront ici
              <br />
              apres votre premier monitoring
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
