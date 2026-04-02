"use client";

/**
 * SettingsPage – Parametres de l'analyse de douleur faciale.
 *
 * Sections :
 *   1. SEUILS D'ACTION UNITS  – baseline et plage de detection par AU
 *   2. MOTEUR DE DOULEUR       – lissage EMA, seuils de spike, double bip
 *   3. CALIBRATION             – duree de la calibration automatique
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
    key: "au4",
    number: "AU4",
    label: "Sourcils abaisses",
    description:
      "Muscle corrugateur (frontal).\n\nMesure l'ecartement vertical entre le sourcil interne et la paupiere superieure, normalise par la distance inter-oculaire.\n\n- Sourcil abaisse = ecartement reduit = score eleve\n- Indicateur le plus predictif de la douleur (Prkachin 2008)\n- Valeur de repos typique : 0.17 - 0.22\n\nReducisez \"Ligne de repos\" si les sourcils du patient sont naturellement bas.\nReducisez \"Plage\" pour une detection plus reactive (risque de faux positifs).",
    baselineRange: [0.05, 0.5],
    rangeRange: [0.02, 0.45],
    step: 0.01,
  },
  {
    key: "au6",
    number: "AU6",
    label: "Joues relevees",
    description:
      "Muscle orbiculaire zygomatique.\n\nMesure l'ecartement vertical entre la joue et le coin externe de l'oeil, normalise par l'inter-oculaire.\n\n- Joue remontee = plissement de l'oeil = score eleve\n- Valeur de repos typique : 0.35 - 0.42",
    baselineRange: [0.1, 0.7],
    rangeRange: [0.02, 0.4],
    step: 0.01,
  },
  {
    key: "au7",
    number: "AU7",
    label: "Paupieres resserrees",
    description:
      "Muscle orbiculaire palpebral (resserrement).\n\nRatio ouverture verticale / largeur de l'oeil (Eye Aspect Ratio simplifie).\n\n- Oeil plisse = EAR reduit = score eleve\n- Reflexe de protection face a la douleur aigue\n- Valeur de repos typique : 0.27 - 0.33\n\nPreferez la calibration automatique pour ce parametre.",
    baselineRange: [0.1, 0.6],
    rangeRange: [0.02, 0.5],
    step: 0.01,
  },
  {
    key: "au9",
    number: "AU9",
    label: "Nez plisse",
    description:
      "Muscle releveur naso-labial.\n\nMesure la somme des distances internes au bout du nez, normalisee par l'inter-oculaire.\n\n- Nez plisse = distances reduites = score eleve\n- Valeur de repos typique : 0.10 - 0.14",
    baselineRange: [0.02, 0.3],
    rangeRange: [0.02, 0.3],
    step: 0.01,
  },
  {
    key: "au10",
    number: "AU10",
    label: "Levre superieure relevee",
    description:
      "Muscle releveur de la levre superieure (levator labii).\n\nRatio ouverture interne de la bouche / distance levre-menton.\n\n- Levre relevee = ouverture augmente = score eleve\n- Valeur de repos typique : 0.24 - 0.30",
    baselineRange: [0.05, 0.6],
    rangeRange: [0.02, 0.4],
    step: 0.01,
  },
  {
    key: "au43",
    number: "AU43",
    label: "Yeux fermes / mi-clos",
    description:
      "Fermeture oculaire - Eye Aspect Ratio 6 points.\n\n- EAR reduit = yeux fermes = score eleve\n- Non inclus dans le PSPI valide mais indicatif\n- Valeur de repos typique : 0.27 - 0.33\n\nUn long clignement declenchera temporairement un score eleve.",
    baselineRange: [0.1, 0.6],
    rangeRange: [0.02, 0.5],
    step: 0.01,
  },
];

// ─── Metadonnees des parametres moteur ───────────────────────────────────────

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
  {
    field: "smoothingWindowMs",
    label: "Lissage EMA",
    description:
      "Constante de temps du lissage exponentiel applique au score PSPI affiche.\n\n- 500-1000 ms : reactif\n- 2000 ms : equilibre (defaut)\n- 3000-5000 ms : tres lisse",
    min: 500,
    max: 5000,
    step: 100,
    decimals: 0,
    unit: " ms",
  },
  {
    field: "spikeLowThreshold",
    label: "Seuil spike - bas",
    description:
      "Score PSPI en-dessous duquel un pic douloureux peut commencer.\n\n- Valeur conseillee : 2-4\n- Trop bas = faux positifs\n- Trop haut = spikes manques",
    min: 1,
    max: 6,
    step: 1,
    decimals: 0,
    unit: "",
  },
  {
    field: "spikeHighThreshold",
    label: "Seuil spike - haut",
    description:
      "Score PSPI au-dessus duquel une montee rapide est qualifiee de spike.\n\n- Valeur conseillee : 7-10",
    min: 4,
    max: 15,
    step: 1,
    decimals: 0,
    unit: "",
  },
  {
    field: "pspiDoubleBipThreshold",
    label: "Double bip - seuil critique",
    description:
      "Score PSPI au-dela duquel un double bip ascendant est joue.\n\n- Valeur conseillee : 11-14",
    min: 6,
    max: 16,
    step: 1,
    decimals: 0,
    unit: "",
  },
  {
    field: "calibrationDurationSec",
    label: "Duree de calibration",
    description:
      "Duree (en secondes) de la phase de calibration automatique du visage neutre.\n\n- 5-10 s : rapide\n- 10-15 s : recommande (defaut : 10 s)\n- 20-30 s : optimal",
    min: 5,
    max: 30,
    step: 5,
    decimals: 0,
    unit: " s",
  },
];

// ─── ValueRow (stepper + progress) ───────────────────────────────────────────

interface ValueRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  unit?: string;
  onChange: (v: number) => void;
  onInfo?: () => void;
}

function ValueRow({
  label,
  value,
  min,
  max,
  step,
  decimals = 2,
  unit = "",
  onChange,
  onInfo,
}: ValueRowProps) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fillPct = `${Math.round(pct * 100)}%`;

  const decrement = () => {
    const next = Math.round((value - step) / step) * step;
    onChange(Math.max(min, parseFloat(next.toFixed(decimals))));
  };
  const increment = () => {
    const next = Math.round((value + step) / step) * step;
    onChange(Math.min(max, parseFloat(next.toFixed(decimals))));
  };

  return (
    <div className="mb-3">
      <div className="flex items-center mb-1.5">
        <span className="flex-1 text-[13px] font-medium text-slate-400">
          {label}
        </span>
        {onInfo && (
          <button
            onClick={onInfo}
            className="ml-1.5 p-0.5 text-cyan-400 hover:text-cyan-300 text-sm"
          >
            &#x2139;
          </button>
        )}
      </div>
      <div className="flex items-center gap-2.5">
        {/* Progress bar */}
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-1.5 bg-indigo-500 rounded-full transition-all"
            style={{ width: fillPct }}
          />
        </div>
        {/* Buttons + value */}
        <div className="flex items-center gap-2">
          <button
            onClick={decrement}
            className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-slate-200 text-lg leading-none hover:bg-slate-700 flex items-center justify-center"
          >
            &minus;
          </button>
          <span className="min-w-[56px] text-center text-sm font-bold text-slate-100 tabular-nums">
            {value.toFixed(decimals)}
            {unit}
          </span>
          <button
            onClick={increment}
            className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-slate-200 text-lg leading-none hover:bg-slate-700 flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
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
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[80vh] bg-[#111827] rounded-2xl p-5 border border-white/[0.08]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[17px] font-bold text-cyan-400 mb-3">{title}</h3>
        <div className="overflow-y-auto max-h-80">
          <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-line">
            {text}
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:shadow-indigo-500/30 rounded-xl text-white font-bold text-[15px] transition-all shadow-lg shadow-indigo-500/20"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

// ─── SectionHeader ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mt-6 mb-3 pl-1">
      <h2 className="text-[13px] font-bold text-cyan-400 uppercase tracking-widest">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ─── AUCard ──────────────────────────────────────────────────────────────────

function AUCard({
  meta,
  thresholds,
  onChange,
  onInfo,
}: {
  meta: AUMeta;
  thresholds: CalibrationThresholds;
  onChange: (
    key: keyof CalibrationThresholds,
    field: "baseline" | "range",
    v: number
  ) => void;
  onInfo: (meta: AUMeta) => void;
}) {
  const t = thresholds[meta.key];
  return (
    <div className="border border-white/[0.06] bg-white/[0.03] rounded-xl p-3.5 mb-2.5">
      <div className="flex items-center mb-3.5">
        <span className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-md mr-2.5">
          {meta.number}
        </span>
        <span className="flex-1 text-[15px] font-semibold text-slate-100">
          {meta.label}
        </span>
        <button
          onClick={() => onInfo(meta)}
          className="p-1 text-cyan-400 hover:text-cyan-300 text-lg"
        >
          &#x2139;
        </button>
      </div>
      <ValueRow
        label="Ligne de repos"
        value={t.baseline}
        min={meta.baselineRange[0]}
        max={meta.baselineRange[1]}
        step={meta.step}
        decimals={2}
        onChange={(v) => onChange(meta.key, "baseline", v)}
      />
      <ValueRow
        label="Plage de detection"
        value={t.range}
        min={meta.rangeRange[0]}
        max={meta.rangeRange[1]}
        step={meta.step}
        decimals={2}
        onChange={(v) => onChange(meta.key, "range", v)}
      />
    </div>
  );
}

// ─── SettingsPage ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();

  const [settings, setSettings] = useState<AppSettings>(() => {
    // loadSettings uses localStorage - safe in "use client"
    try {
      const s = loadSettings();
      return JSON.parse(JSON.stringify(s)) as AppSettings;
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS)) as AppSettings;
    }
  });

  const [infoModal, setInfoModal] = useState<{
    title: string;
    text: string;
  } | null>(null);

  // ── AU threshold changes ───────────────────────────────────────────────────
  const handleAUChange = useCallback(
    (
      key: keyof CalibrationThresholds,
      field: "baseline" | "range",
      v: number
    ) => {
      setSettings((prev) => ({
        ...prev,
        thresholds: {
          ...prev.thresholds,
          [key]: { ...prev.thresholds[key], [field]: v },
        },
      }));
    },
    []
  );

  // ── Engine param changes ───────────────────────────────────────────────────
  const handleEngineChange = useCallback(
    (field: keyof Omit<AppSettings, "thresholds">, v: number) => {
      setSettings((prev) => ({ ...prev, [field]: v }));
    },
    []
  );

  const openAUInfo = useCallback((meta: AUMeta) => {
    setInfoModal({
      title: `${meta.number} - ${meta.label}`,
      text: meta.description,
    });
  }, []);

  const openEngineInfo = useCallback((param: EngineMeta) => {
    setInfoModal({ title: param.label, text: param.description });
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    saveSettings(settings);
    window.alert(
      "Paramètres enregistrés.\nLes nouveaux réglages seront appliqués au prochain monitoring."
    );
    router.back();
  }, [settings, router]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    const ok = window.confirm(
      "Réinitialiser les paramètres ?\nTous les réglages reviendront aux valeurs par défaut."
    );
    if (!ok) return;
    resetSettings();
    setSettings(
      JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS)) as AppSettings
    );
  }, []);

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-[#0a0e1a]">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-28 max-w-2xl mx-auto w-full">
        {/* Back link */}
        <button
          onClick={() => router.back()}
          className="text-sm text-indigo-400 hover:text-indigo-300 mb-2 mt-3 flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour
        </button>

        <h1 className="text-xl font-bold text-white mb-1">Paramètres</h1>

        {/* ─── Seuils AU ─────────────────────────────────────── */}
        <SectionHeader
          title="Seuils d'Action Units"
          subtitle="Calibration manuelle fine - remplacee par la calibration automatique si effectuee depuis l'ecran de monitoring."
        />

        {AU_LIST.map((meta) => (
          <AUCard
            key={meta.key}
            meta={meta}
            thresholds={settings.thresholds}
            onChange={handleAUChange}
            onInfo={openAUInfo}
          />
        ))}

        {/* ─── Moteur de douleur ──────────────────────────────── */}
        <SectionHeader
          title="Moteur de douleur"
          subtitle="Lissage, detection de spikes et alertes sonores."
        />

        <div className="border border-white/[0.06] bg-white/[0.03] rounded-xl p-3.5 mb-2.5">
          {ENGINE_PARAMS.filter(
            (p) => p.field !== "calibrationDurationSec"
          ).map((param) => (
            <ValueRow
              key={param.field}
              label={param.label}
              value={settings[param.field] as number}
              min={param.min}
              max={param.max}
              step={param.step}
              decimals={param.decimals}
              unit={param.unit}
              onChange={(v) => handleEngineChange(param.field, v)}
              onInfo={() => openEngineInfo(param)}
            />
          ))}
        </div>

        {/* ─── Calibration ────────────────────────────────────── */}
        <SectionHeader
          title="Calibration automatique"
          subtitle="Duree de la phase de visage neutre."
        />

        <div className="border border-white/[0.06] bg-white/[0.03] rounded-xl p-3.5 mb-2.5">
          {ENGINE_PARAMS.filter(
            (p) => p.field === "calibrationDurationSec"
          ).map((param) => (
            <ValueRow
              key={param.field}
              label={param.label}
              value={settings[param.field] as number}
              min={param.min}
              max={param.max}
              step={param.step}
              decimals={param.decimals}
              unit={param.unit}
              onChange={(v) => handleEngineChange(param.field, v)}
              onInfo={() => openEngineInfo(param)}
            />
          ))}
        </div>
      </div>

      {/* ─── Sticky bottom bar ──────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0a0e1a] border-t border-white/[0.06] p-4 pb-8 flex gap-3 max-w-2xl mx-auto">
        <button
          onClick={handleReset}
          className="flex-1 py-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 font-semibold text-[15px] hover:bg-red-500/20 transition-colors"
        >
          Réinitialiser
        </button>
        <button
          onClick={handleSave}
          className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-bold text-[15px] shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all"
        >
          Enregistrer
        </button>
      </div>

      {/* ─── Info modal ─────────────────────────────────────── */}
      {infoModal && (
        <InfoModal
          title={infoModal.title}
          text={infoModal.text}
          onClose={() => setInfoModal(null)}
        />
      )}
    </div>
  );
}
