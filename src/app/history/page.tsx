"use client";

/**
 * HistoryPage – Dernières séances tous patients confondus.
 * Clinical / éditorial theme.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getRecentSessions, deleteSession } from "../../services/DatabaseService";
import type { Session } from "../../types/patient";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pspiHex(score: number): string {
  if (score <= 4) return "var(--color-pspi-green)";
  if (score <= 8) return "var(--color-pspi-amber)";
  return "var(--color-pspi-rose)";
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayLabel(dayTs: number): string {
  const today = startOfDay(Date.now());
  const yest = today - 86_400_000;
  if (dayTs === today) return "Aujourd'hui";
  if (dayTs === yest) return "Hier";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(dayTs));
}

// ─── Filter types ────────────────────────────────────────────────────────────

type Range = "7" | "30" | "90" | "all";
const RANGES: [Range, string][] = [["7", "7 j."], ["30", "30 j."], ["90", "90 j."], ["all", "Tout"]];

// ─── SessionRow ──────────────────────────────────────────────────────────────

function SessionRow({
  session,
  onDelete,
}: {
  session: Session & { patientNom?: string };
  onDelete: (id: string) => void;
}) {
  const color = pspiHex(session.moyennePSPI);
  const name = session.patientNom ?? "Séance anonyme";

  return (
    <div
      className="flex items-center gap-3.5 px-5 py-3"
      style={{ borderTop: "1px solid var(--color-ink-rule)" }}
    >
      <span
        className="w-[38px] text-[11px] text-[var(--color-ink-50)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {formatTime(session.date)}
      </span>
      <div className="h-9 w-[4px] rounded-sm" style={{ background: color }} />
      <Link href={`/session/${session.id}`} className="min-w-0 flex-1 no-underline">
        <div className="truncate text-[14px] text-[var(--color-ink)]" style={{ letterSpacing: "-0.1px" }}>
          {name}
        </div>
        <div className="text-[10.5px] text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)" }}>
          {formatDuration(session.duree)}
          {session.painEvents.length > 0
            ? ` · ${session.painEvents.length} pic${session.painEvents.length > 1 ? "s" : ""}`
            : ""}
        </div>
      </Link>

      {/* micro sparkline */}
      <Sparkline session={session} color={color} />

      <div className="min-w-[56px] text-right">
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, color, lineHeight: 1 }}>
          {session.moyennePSPI.toFixed(1)}
        </div>
        <div className="mt-[2px] text-[9px] uppercase text-[var(--color-ink-30)]" style={{ letterSpacing: "0.1em" }}>
          max {session.maxPSPI.toFixed(1)}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(session.id)}
        className="ml-1.5 p-1 text-[var(--color-ink-30)] transition-colors hover:text-[var(--color-pspi-rose)]"
        aria-label="Supprimer la séance"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M19 6l-.867 12.142A2 2 0 0116.138 20H7.862a2 2 0 01-1.995-1.858L5 6m5 4v6m4-6v6" />
        </svg>
      </button>
    </div>
  );
}

function Sparkline({ session, color }: { session: Session; color: string }) {
  const pts = useMemo(() => {
    const n = 8;
    const src = session.painScores;
    if (src.length < 2) return null;
    const bins: number[] = [];
    for (let i = 0; i < n; i++) {
      const lo = Math.floor((i * src.length) / n);
      const hi = Math.max(lo + 1, Math.floor(((i + 1) * src.length) / n));
      const slice = src.slice(lo, hi);
      const avg = slice.reduce((a, b) => a + b.score, 0) / Math.max(1, slice.length);
      bins.push(avg);
    }
    return bins;
  }, [session.painScores]);

  if (!pts) return <div style={{ width: 48, height: 16 }} />;
  const W = 48;
  const H = 16;
  const path = pts
    .map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${(H - (v / 16) * H).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H}>
      <polyline points={path} fill="none" stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── HistoryPage ──────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const [sessions, setSessions] = useState<(Session & { patientNom?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("30");

  const loadSessions = useCallback(async () => {
    try {
      const data = await getRecentSessions(100);
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

  const filtered = useMemo(() => {
    if (range === "all") return sessions;
    const cutoff = Date.now() - Number(range) * 86_400_000;
    return sessions.filter((s) => s.date >= cutoff);
  }, [sessions, range]);

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<number, typeof filtered>();
    for (const s of filtered) {
      const day = startOfDay(s.date);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const uniquePatients = useMemo(
    () => new Set(filtered.map((s) => s.patientId ?? "anon")).size,
    [filtered],
  );

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Supprimer cette séance ? Cette action est irréversible.")) return;
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error("[HistoryPage] delete failed:", e);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--color-ivory)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-15)] border-t-[var(--color-ink)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-[var(--color-ivory)]">
      {/* Title */}
      <div className="px-5 pt-3 pb-2">
        <h1 className="text-[var(--color-ink)]" style={{ fontFamily: "var(--font-serif)", fontSize: 32, letterSpacing: "-0.4px", lineHeight: 1 }}>
          Historique
        </h1>
        <p className="mt-2 text-[12.5px] text-[var(--color-ink-50)]">
          {filtered.length} séance{filtered.length > 1 ? "s" : ""} · {uniquePatients} patient{uniquePatients > 1 ? "s" : ""}
        </p>
      </div>

      {/* Range pills */}
      <div className="flex gap-2.5 px-5 pb-2">
        {RANGES.map(([key, label]) => {
          const active = range === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              className="rounded-full px-3.5 py-[7px] text-[12px]"
              style={{
                background: active ? "var(--color-ink)" : "transparent",
                color: active ? "var(--color-ivory)" : "var(--color-ink-70)",
                border: `1px solid ${active ? "var(--color-ink)" : "var(--color-ink-15)"}`,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="pb-8">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center pt-16 px-5 text-center">
            <p className="text-[17px] text-[var(--color-ink)]" style={{ fontFamily: "var(--font-serif)", letterSpacing: "-0.3px" }}>
              Aucune séance enregistrée
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ink-50)]">
              Les séances apparaîtront ici après votre premier monitoring.
            </p>
          </div>
        ) : (
          grouped.map(([day, rows]) => (
            <div key={day}>
              <div className="flex items-baseline justify-between px-7 pt-4 pb-1.5">
                <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
                  {dayLabel(day)}
                </span>
                <span className="text-[10px] text-[var(--color-ink-30)]" style={{ fontFamily: "var(--font-mono)" }}>
                  {rows.length} séance{rows.length > 1 ? "s" : ""}
                </span>
              </div>
              {rows.map((s) => (
                <SessionRow key={s.id} session={s} onDelete={handleDelete} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
