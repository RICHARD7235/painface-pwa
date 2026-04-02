"use client";

/**
 * ConsentScreen – Formulaire de consentement RGPD patient (Art. 9).
 * Premium dark medical theme.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import SignatureCanvas, {
  type SignatureCanvasRef,
} from "../../../components/SignatureCanvas";
import { sha256, CONSENT_VERSION } from "../../../services/EncryptionService";
import {
  insertConsent,
  getPatientById,
  getConsentByPatient,
  hasConsent,
} from "../../../services/DatabaseService";
import type { Patient, PatientConsent } from "../../../types/patient";

// ── Sous-composants ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider px-4 pt-5 pb-2">
      {children}
    </h2>
  );
}

function CheckItem({ ok, children }: { ok: boolean; children: string }) {
  return (
    <div className="flex items-start gap-2 mb-1.5">
      <span
        className={`text-sm font-bold w-5 text-center shrink-0 ${ok ? "text-green-500" : "text-red-400"}`}
      >
        {ok ? "\u2713" : "\u2717"}
      </span>
      <span className="text-sm leading-[21px] text-slate-300">{children}</span>
    </div>
  );
}

function RightItem({
  emoji,
  title,
  desc,
}: {
  emoji: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-2.5 mb-2.5">
      <span className="text-lg leading-6 mt-0.5 shrink-0">{emoji}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-[13px] text-slate-400 mt-0.5 leading-[18px]">
          {desc}
        </p>
      </div>
    </div>
  );
}

// ── ConsentScreen ────────────────────────────────────────────────────────────

export default function ConsentPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;
  const router = useRouter();

  const signatureRef = useRef<SignatureCanvasRef>(null);
  const [signed, setSigned] = useState(false);
  const [saving, setSaving] = useState(false);

  const [patient, setPatient] = useState<Patient | null>(null);
  const [existingConsent, setExistingConsent] =
    useState<PatientConsent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    async function load() {
      const [p, consent] = await Promise.all([
        getPatientById(patientId),
        getConsentByPatient(patientId),
      ]);
      setPatient(p);
      setExistingConsent(consent);
      setLoading(false);
    }
    load();
  }, [patientId]);

  const patientName = patient
    ? `${patient.prenom} ${patient.nom}`
    : "Patient";

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleRefuse() {
    const confirmed = window.confirm(
      "Sans consentement, les données de ce patient ne peuvent pas être enregistrées. " +
        "Vous pouvez recueillir le consentement ultérieurement depuis le dossier patient.\n\n" +
        "Confirmer le refus ?",
    );
    if (confirmed) {
      router.back();
    }
  }

  async function handleAccept() {
    if (!patientId) {
      window.alert("Identifiant patient manquant.");
      return;
    }

    if (!signatureRef.current?.hasSignature()) {
      window.alert(
        "Veuillez signer dans la zone prévue avant de valider le consentement.",
      );
      return;
    }

    setSaving(true);
    try {
      const dataUrl = signatureRef.current.toDataURL();
      const hash = await sha256(dataUrl);

      await insertConsent({
        id: crypto.randomUUID(),
        patientId,
        timestamp: Date.now(),
        version: CONSENT_VERSION,
        signatureHash: hash,
      });

      router.back();
    } catch (e) {
      window.alert(
        "Impossible d'enregistrer le consentement. Veuillez réessayer.",
      );
      console.error("[ConsentScreen]", e);
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 flex-col bg-[#0a0e1a] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Already consented ──────────────────────────────────────────────────────

  if (existingConsent) {
    return (
      <div className="flex flex-1 flex-col bg-[#0a0e1a]">
        <div className="bg-gradient-to-b from-indigo-600/20 to-transparent text-center pt-10 pb-6 px-5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-indigo-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Consentement RGPD
          </h1>
          <p className="text-sm text-slate-400 font-medium mt-1">
            Patient : {patientName}
          </p>
        </div>
        <div className="max-w-xl mx-auto px-4 py-8 w-full">
          <div className="border border-white/[0.06] bg-white/[0.03] rounded-xl p-6 text-center">
            <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-4 py-2 mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="font-semibold text-sm">
                Consentement enregistré
              </span>
            </div>
            <p className="text-sm text-slate-400 mb-2">
              Le consentement a été signé le{" "}
              <strong className="text-white">
                {new Date(existingConsent.timestamp).toLocaleDateString(
                  "fr-FR",
                  {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  },
                )}
              </strong>
              .
            </p>
            <p className="text-xs text-slate-600">
              Version du formulaire : v{existingConsent.version}
            </p>
            <p className="text-xs text-slate-600 mt-1 font-mono">
              Hash : {existingConsent.signatureHash.slice(0, 16)}...
            </p>
            <button
              onClick={() => router.back()}
              className="mt-6 px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Formulaire de consentement ─────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-[#0a0e1a]">
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-indigo-600/20 to-transparent text-center pt-8 pb-5 px-5">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-indigo-400 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
        <h1 className="text-xl font-extrabold text-white tracking-tight">
          Consentement RGPD
        </h1>
        <p className="text-sm text-slate-400 font-medium mt-1">
          Patient : {patientName}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          Date :{" "}
          {new Date().toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>

      <div className="max-w-xl mx-auto pb-8 w-full">
        {/* ── 1. Présentation ─────────────────────────────────────────── */}
        <SectionTitle>{"1. Présentation de l'application"}</SectionTitle>
        <div className="mx-4 border border-white/[0.06] bg-white/[0.03] rounded-xl p-4">
          <p className="text-sm leading-[21px] text-slate-300">
            PainFace est un logiciel d&apos;aide à la rééducation utilisé par
            votre kinésithérapeute pour mesurer objectivement votre niveau de
            douleur au cours des séances de soins.
          </p>
          <p className="text-sm leading-[21px] text-slate-300 mt-2.5">
            L&apos;application analyse en temps réel les micro-expressions de
            votre visage à l&apos;aide de la caméra de l&apos;appareil pour
            calculer un score de douleur (indice PSPI). Ce traitement est
            réalisé en local, directement sur l&apos;appareil — aucune donnée
            n&apos;est envoyée vers un serveur.
          </p>
        </div>

        {/* ── 2. Données collectées ───────────────────────────────────── */}
        <SectionTitle>{"2. Données collectées"}</SectionTitle>
        <div className="mx-4 border border-white/[0.06] bg-white/[0.03] rounded-xl p-4">
          <p className="text-sm leading-[21px] text-slate-300 mb-2.5">
            Conformément au principe de minimisation des données (RGPD Art.
            5.1.c) :
          </p>
          <CheckItem ok>
            Scores de douleur PSPI (0-16) et horodatages
          </CheckItem>
          <CheckItem ok>Durée des séances</CheckItem>
          <CheckItem ok>Notes cliniques du praticien</CheckItem>
          <CheckItem ok>
            Profil de calibration facial (seuils de mesure personnalisés)
          </CheckItem>

          <div className="h-px bg-white/[0.06] my-2.5" />

          <CheckItem ok={false}>
            Images ou vidéos de votre visage
          </CheckItem>
          <CheckItem ok={false}>
            Enregistrements audio ou visuels
          </CheckItem>
          <CheckItem ok={false}>Données de localisation</CheckItem>
          <CheckItem ok={false}>
            Landmarks faciaux bruts (supprimés immédiatement après calcul)
          </CheckItem>
          <CheckItem ok={false}>
            Transmission vers un serveur distant
          </CheckItem>

          <div className="rounded-lg p-3 mt-3 border border-indigo-500/20 bg-indigo-500/10">
            <p className="text-[13px] leading-[19px] text-indigo-300">
              Toutes les données sont stockées uniquement sur cet
              appareil. Votre kinésithérapeute est le seul à y avoir accès.
            </p>
          </div>
        </div>

        {/* ── 3. Bases légales & droits ──────────────────────────────── */}
        <SectionTitle>{"3. Base légale et vos droits"}</SectionTitle>
        <div className="mx-4 border border-white/[0.06] bg-white/[0.03] rounded-xl p-4">
          <p className="text-sm leading-[21px] text-slate-300">
            Le traitement est fondé sur votre consentement explicite (RGPD
            Art. 9.2.a) pour des données de santé dans le cadre d&apos;une
            prise en charge médicale.
          </p>
          <p className="text-sm leading-[21px] text-slate-300 mt-2.5">
            Vous disposez des droits suivants, exerçables à tout moment :
          </p>

          <div className="mt-3">
            <RightItem
              emoji="&#x1F4CB;"
              title="Droit d'accès (Art. 15)"
              desc="Obtenir une copie de toutes vos données stockées."
            />
            <RightItem
              emoji="&#x270F;&#xFE0F;"
              title="Droit de rectification (Art. 16)"
              desc="Corriger vos informations personnelles (nom, date de naissance)."
            />
            <RightItem
              emoji="&#x1F5D1;&#xFE0F;"
              title="Droit à l'effacement (Art. 17)"
              desc="Supprimer l'intégralité de votre dossier, y compris toutes les séances."
            />
            <RightItem
              emoji="&#x1F6AB;"
              title="Droit d'opposition (Art. 21)"
              desc="Retirer votre consentement à tout moment sans préjudice."
            />
            <RightItem
              emoji="&#x1F4E6;"
              title="Droit à la portabilité (Art. 20)"
              desc="Exporter vos données dans un format lisible."
            />
          </div>

          <p className="text-sm leading-[21px] text-slate-300 mt-2.5">
            Pour exercer ces droits, contactez votre kinésithérapeute. Vous
            pouvez également saisir la CNIL (www.cnil.fr) en cas de litige.
          </p>
        </div>

        {/* ── 4. Avertissement médical ──────────────────────────────── */}
        <SectionTitle>{"4. Avertissement médical"}</SectionTitle>
        <div className="mx-4 border border-white/[0.06] bg-white/[0.03] rounded-xl p-4">
          <div className="rounded-lg p-3 border border-amber-500/20 bg-amber-500/10">
            <p className="text-[13px] leading-[19px] text-amber-300 font-medium">
              PainFace est un outil d&apos;aide à la
              décision clinique. Il ne remplace en aucun cas le jugement du
              professionnel de santé. Les scores affichés sont des estimations
              algorithmiques et ne constituent pas un diagnostic médical.
            </p>
          </div>
        </div>

        {/* ── 5. Déclaration de consentement ────────────────────────── */}
        <SectionTitle>{"5. Déclaration de consentement"}</SectionTitle>
        <div className="mx-4 border border-white/[0.06] bg-white/[0.03] rounded-xl p-4">
          <p className="text-sm leading-[21px] text-slate-300">
            En signant ci-dessous, je déclare :
          </p>
          <p className="text-sm leading-[22px] text-slate-300 mt-1">
            &bull; Avoir pris connaissance des informations ci-dessus
          </p>
          <p className="text-sm leading-[22px] text-slate-300 mt-1">
            &bull; Comprendre la nature et la finalité du traitement de mes
            données
          </p>
          <p className="text-sm leading-[22px] text-slate-300 mt-1">
            &bull; Consentir librement au traitement de mes données de santé
            par cet outil dans le cadre de ma prise en charge
            kinésithérapeutique
          </p>
          <p className="text-sm leading-[22px] text-slate-300 mt-1 mb-1">
            &bull; Avoir été informé(e) de mon droit de retrait à tout moment
          </p>
        </div>

        {/* ── 6. Zone de signature ──────────────────────────────────── */}
        <SectionTitle>{"6. Signature du patient"}</SectionTitle>
        <div className="mx-4 space-y-2">
          <SignatureCanvas
            ref={signatureRef}
            height={200}
            strokeColor="#ffffff"
            strokeWidth={2}
            onSign={() => setSigned(true)}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                signatureRef.current?.clear();
                setSigned(false);
              }}
              className="px-3.5 py-1.5 rounded-md border border-white/[0.08] bg-white/[0.05] text-slate-400 text-[13px] font-medium hover:bg-white/[0.08] transition-colors"
            >
              Effacer
            </button>
          </div>
        </div>

        {/* ── Version du formulaire ─────────────────────────────────── */}
        <p className="text-[11px] text-slate-600 text-center mt-3">
          Formulaire de consentement v{CONSENT_VERSION}
        </p>

        {/* ── Boutons Refuser / Accepter ─────────────────────────────── */}
        <div className="flex gap-3 mx-4 mt-5 pb-5">
          <button
            type="button"
            onClick={handleRefuse}
            className="flex-1 py-4 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 font-semibold text-[15px] hover:bg-red-500/20 transition-colors"
          >
            Refuser
          </button>

          <button
            type="button"
            onClick={handleAccept}
            disabled={!signed || saving}
            className={`flex-[2] py-4 rounded-xl font-bold text-[15px] text-white transition-all ${
              signed && !saving
                ? "bg-gradient-to-r from-indigo-600 to-indigo-500 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
                : "bg-indigo-500/30 cursor-not-allowed"
            }`}
          >
            {saving ? (
              <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              "Accepter et signer \u2713"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
