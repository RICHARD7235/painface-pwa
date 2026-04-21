"use client";

/**
 * SettingsPage – Paramètres de l'analyse de douleur faciale.
 * Clinical / éditorial theme.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  loadSettings,
  resetSettings,
  saveSettings,
} from "../../services/SettingsService";
import type { CalibrationThresholds } from "../../types/actionUnits";

// ─── Metadonnees des Action Units ────────────────────────────────────────────

interface AUMeta {
  key: keyof CalibrationThresholds;
  number: string;
  label: string;
  description: string;
  baselineRange: [number, number];
  rangeRange: [number, number];
  step: number;
}

const AU_LIST: AUMeta[] = [
  {
    key: "au4", number: "AU4", label: "Sourcils abaissés",
    description: "Muscle corrugateur (frontal). Indicateur le plus prédictif de la douleur (Prkachin 2008).",
    baselineRange: [0.05, 0.5], rangeRange: [0.02, 0.45], step: 0.01,
  },
  {
    key: "au6", number: "AU6", label: "Joues relevées",
    description: "Muscle orbiculaire zygomatique. Joue remontée = plissement de l'œil.",
    baselineRange: [0.1, 0.7], rangeRange: [0.02, 0.4], step: 0.01,
  },
  {
    key: "au7", number: "AU7", label: "Paupières resserrées",
    description: "Réflexe de protection face à la douleur aiguë. Préférez la calibration automatique.",
    baselineRange: [0.1, 0.6], rangeRange: [0.02, 0.5], step: 0.01,
  },
  {
    key: "au9", number: "AU9", label: "Nez plissé",
    description: "Muscle releveur naso-labial. Valeur de repos typique : 0.10 – 0.14.",
    baselineRange: [0.02, 0.3], rangeRange: [0.02, 0.3], step: 0.01,
  },
  {
    key: "au10", number: "AU10", label: "Lèvre sup. relevée",
    description: "Muscle releveur de la lèvre supérieure. Valeur de repos typique : 0.24 – 0.30.",
    baselineRange: [0.05, 0.6], rangeRange: [0.02, 0.4], step: 0.01,
  },
  {
    key: "au43", number: "AU43", label: "Yeux fermés",
    description: "Eye Aspect Ratio. Non inclus dans le PSPI mais indicatif.",
    baselineRange: [0.1, 0.6], rangeRange: [0.02, 0.5], step: 0.01,
  },
];

// ─── Parametres moteur ───────────────────────────────────────────────────────

interface EngineMeta {
  field: keyof Omit<AppSettings, "thresholds">;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit: string;
}

const ENGINE_PARAMS: EngineMeta[] = [
  { field: "smoothingWindowMs", label: "Lissage EMA", description: "Constante de temps du lissage exponentiel. Équilibre recommandé : 2000 ms.", min: 500, max: 5000, step: 100, decimals: 0, unit: " ms" },
  { field: "spikeLowThreshold", label: "Seuil spike bas", description: "PSPI sous lequel un pic peut commencer. Valeur conseillée : 2 – 4.", min: 1, max: 6, step: 1, decimals: 0, unit: "" },
  { field: "spikeHighThreshold", label: "Seuil spike haut", description: "PSPI au-dessus duquel une montée est qualifiée de spike. Valeur conseillée : 7 – 10.", min: 4, max: 15, step: 1, decimals: 0, unit: "" },
  { field: "pspiDoubleBipThreshold", label: "Double bip", description: "PSPI au-delà duquel un double bip est joué. Valeur conseillée : 11 – 14.", min: 6, max: 16, step: 1, decimals: 0, unit: "" },
  { field: "calibrationDurationSec", label: "Durée visage neutre", description: "Durée de la phase de calibration automatique.", min: 5, max: 30, step: 5, decimals: 0, unit: " s" },
];

// ─── Slider ──────────────────────────────────────────────────────────────────

function Slider({
  label,
  value,
  min,
  max,
  onChange,
  decimals = 2,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  decimals?: number;
  unit?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100)));

  return (
    <div className="flex-1">
      <div className="flex justify-between mb-1.5">
        <span className="text-[10px] text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)" }}>
          {label}
        </span>
        <span className="text-[10px] text-[var(--color-ink)]" style={{ fontFamily: "var(--font-mono)" }}>
          {value.toFixed(decimals)}
          {unit}
        </span>
      </div>
      <div className="relative h-[3px] rounded-sm" style={{ background: "var(--color-ink-08)" }}>
        <div className="h-[3px] rounded-sm" style={{ width: `${pct}%`, background: "var(--color-ink)" }} />
        <div
          className="absolute top-[-3px] h-[9px] w-[9px] rounded-full"
          style={{
            left: `${pct}%`,
            transform: "translateX(-50%)",
            background: "var(--color-ink)",
            border: "1.5px solid var(--color-ivory)",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={(max - min) / 100}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

// ─── Stepper for integer engine params ───────────────────────────────────────

function Stepper({
  value,
  min,
  max,
  step,
  onChange,
  decimals,
  unit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  decimals: number;
  unit: string;
}) {
  const dec = () => onChange(Math.max(min, parseFloat((value - step).toFixed(decimals))));
  const inc = () => onChange(Math.min(max, parseFloat((value + step).toFixed(decimals))));
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={dec}
        className="h-7 w-7 rounded-full text-[15px] leading-none text-[var(--color-ink-70)] transition-colors hover:bg-[var(--color-paper-alt)]"
        style={{ border: "1px solid var(--color-ink-15)" }}
      >
        −
      </button>
      <span
        className="min-w-[62px] text-center text-[12px] text-[var(--color-ink)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value.toFixed(decimals)}
        {unit}
      </span>
      <button
        onClick={inc}
        className="h-7 w-7 rounded-full text-[15px] leading-none text-[var(--color-ink-70)] transition-colors hover:bg-[var(--color-paper-alt)]"
        style={{ border: "1px solid var(--color-ink-15)" }}
      >
        +
      </button>
    </div>
  );
}

// ─── InfoModal ───────────────────────────────────────────────────────────────

function InfoModal({
  title,
  text,
  onClose,
}: {
  title: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink)]/40 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[20px] bg-[var(--color-ivory)] p-5"
        style={{ border: "1px solid var(--color-ink-08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="mb-2 text-[var(--color-ink)]"
          style={{ fontFamily: "var(--font-serif)", fontSize: 22, letterSpacing: "-0.3px", lineHeight: 1.15 }}
        >
          {title}
        </h3>
        <p className="text-[13px] leading-[1.5] text-[var(--color-ink-70)] whitespace-pre-line">{text}</p>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-[12px] bg-[var(--color-ink)] py-2.5 text-[13px] font-medium text-[var(--color-ivory)]"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ roman, title }: { roman: string; title: string }) {
  return (
    <div className="px-7 pt-5 pb-1.5">
      <span className="text-[10px] uppercase text-[var(--color-accent-ink)]" style={{ letterSpacing: "0.12em", fontWeight: 500 }}>
        {roman}. {title}
      </span>
    </div>
  );
}

// ─── Info icon ───────────────────────────────────────────────────────────────

function InfoIcon({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-1 text-[var(--color-ink-30)] transition-colors hover:text-[var(--color-ink-70)]">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 8v.01" />
      </svg>
    </button>
  );
}

// ─── SettingsPage ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const s = loadSettings();
      return JSON.parse(JSON.stringify(s)) as AppSettings;
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS)) as AppSettings;
    }
  });

  const [infoModal, setInfoModal] = useState<{ title: string; text: string } | null>(null);

  const handleAUChange = useCallback(
    (key: keyof CalibrationThresholds, field: "baseline" | "range", v: number) => {
      setSettings((prev) => ({
        ...prev,
        thresholds: {
          ...prev.thresholds,
          [key]: { ...prev.thresholds[key], [field]: v },
        },
      }));
    },
    [],
  );

  const handleEngineChange = useCallback(
    (field: keyof Omit<AppSettings, "thresholds">, v: number) => {
      setSettings((prev) => ({ ...prev, [field]: v }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    saveSettings(settings);
    window.alert("Paramètres enregistrés.\nLes nouveaux réglages seront appliqués au prochain monitoring.");
    router.back();
  }, [settings, router]);

  const handleReset = useCallback(() => {
    const ok = window.confirm("Réinitialiser les paramètres ?\nTous les réglages reviendront aux valeurs par défaut.");
    if (!ok) return;
    resetSettings();
    setSettings(JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS)) as AppSettings);
  }, []);

  const calibrationParam = ENGINE_PARAMS.find((p) => p.field === "calibrationDurationSec")!;

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-[var(--color-ivory)]">
      <div className="flex-1 min-h-0 overflow-y-auto pb-28">
        {/* Top bar + title */}
        <div className="px-5 pt-3 pb-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-1 text-[var(--color-ink-70)] text-[14px]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Retour
          </button>
          <h1 className="mt-2 text-[var(--color-ink)]" style={{ fontFamily: "var(--font-serif)", fontSize: 32, letterSpacing: "-0.4px", lineHeight: 1 }}>
            Paramètres
          </h1>
          <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-50)]">
            Calibration · lissage · seuils FACS
          </p>
        </div>

        {/* Section I — Action Units */}
        <SectionHeader roman="I" title="Seuils des Action Units" />
        <div className="px-7 pb-2 text-[12px] leading-[1.5] text-[var(--color-ink-50)]">
          Remplacés automatiquement lors de la calibration visage neutre.
        </div>

        <div className="px-5">
          {AU_LIST.map((meta, i) => {
            const t = settings.thresholds[meta.key];
            return (
              <div
                key={meta.key}
                className="py-3.5"
                style={{ borderBottom: i < AU_LIST.length - 1 ? "1px solid var(--color-ink-rule)" : "none" }}
              >
                <div className="mb-2.5 flex items-baseline gap-2.5">
                  <span
                    className="w-[38px] text-[10px] font-semibold text-[var(--color-accent-ink)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {meta.number}
                  </span>
                  <span className="text-[13.5px] font-medium text-[var(--color-ink)]">{meta.label}</span>
                  <div className="flex-1" />
                  <InfoIcon onClick={() => setInfoModal({ title: `${meta.number} — ${meta.label}`, text: meta.description })} />
                </div>
                <div className="flex gap-5">
                  <Slider
                    label="Repos"
                    value={t.baseline}
                    min={meta.baselineRange[0]}
                    max={meta.baselineRange[1]}
                    onChange={(v) => handleAUChange(meta.key, "baseline", parseFloat(v.toFixed(2)))}
                  />
                  <Slider
                    label="Plage"
                    value={t.range}
                    min={meta.rangeRange[0]}
                    max={meta.rangeRange[1]}
                    onChange={(v) => handleAUChange(meta.key, "range", parseFloat(v.toFixed(2)))}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Section II — Moteur de douleur */}
        <SectionHeader roman="II" title="Moteur de douleur" />
        <div className="px-5">
          {ENGINE_PARAMS.filter((p) => p.field !== "calibrationDurationSec").map((param, i, arr) => (
            <div
              key={param.field}
              className="flex items-center py-3"
              style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--color-ink-rule)" : "none" }}
            >
              <span className="text-[14px] text-[var(--color-ink)]">{param.label}</span>
              <div className="flex-1" />
              <Stepper
                value={settings[param.field] as number}
                min={param.min}
                max={param.max}
                step={param.step}
                decimals={param.decimals}
                unit={param.unit}
                onChange={(v) => handleEngineChange(param.field, v)}
              />
              <InfoIcon onClick={() => setInfoModal({ title: param.label, text: param.description })} />
            </div>
          ))}
        </div>

        {/* Section III — Calibration */}
        <SectionHeader roman="III" title="Calibration" />
        <div className="px-5 pb-4">
          <div className="flex items-center py-3" style={{ borderBottom: "1px solid var(--color-ink-rule)" }}>
            <span className="text-[14px] text-[var(--color-ink)]">{calibrationParam.label}</span>
            <div className="flex-1" />
            <Stepper
              value={settings.calibrationDurationSec}
              min={calibrationParam.min}
              max={calibrationParam.max}
              step={calibrationParam.step}
              decimals={calibrationParam.decimals}
              unit={calibrationParam.unit}
              onChange={(v) => handleEngineChange("calibrationDurationSec", v)}
            />
            <InfoIcon onClick={() => setInfoModal({ title: calibrationParam.label, text: calibrationParam.description })} />
          </div>
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div
        className="fixed bottom-0 left-0 right-0 flex gap-2.5 bg-[var(--color-ivory)] px-5 pb-8 pt-3"
        style={{ borderTop: "1px solid var(--color-ink-08)" }}
      >
        <button
          onClick={handleReset}
          className="flex-1 rounded-[14px] py-3 text-[13.5px] font-medium text-[var(--color-ink)] transition-colors"
          style={{ border: "1px solid var(--color-ink-15)" }}
        >
          Réinitialiser
        </button>
        <button
          onClick={handleSave}
          className="flex-[2] rounded-[14px] bg-[var(--color-ink)] py-3 text-[13.5px] font-medium text-[var(--color-ivory)]"
        >
          Enregistrer
        </button>
      </div>

      {infoModal && <InfoModal title={infoModal.title} text={infoModal.text} onClose={() => setInfoModal(null)} />}
    </div>
  );
}
