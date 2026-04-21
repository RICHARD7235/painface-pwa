"use client";

/**
 * ConsentScreen – Formulaire de consentement RGPD patient (Art. 9).
 * Clinical / éditorial theme.
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
} from "../../../services/DatabaseService";
import type { Patient, PatientConsent } from "../../../types/patient";

// ── Sous-composants ──────────────────────────────────────────────────────────

function Label({ children }: { children: string }) {
  return (
    <span
      className="text-[10px] uppercase text-[var(--color-ink-50)]"
      style={{ letterSpacing: "0.12em", fontWeight: 500 }}
    >
      {children}
    </span>
  );
}

function CheckRow({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex gap-3.5 py-3.5" style={{ borderBottom: "1px solid var(--color-ink-rule)" }}>
      <div
        className="mt-[2px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[var(--color-ink)]"
        style={{ border: "1px solid var(--color-ink)" }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12l5 5L20 6" />
        </svg>
      </div>
      <div>
        <div className="text-[14px] font-medium text-[var(--color-ink)]">{title}</div>
        <div className="mt-[2px] text-[12.5px] leading-[1.45] text-[var(--color-ink-50)]">{desc}</div>
      </div>
    </div>
  );
}

function RightItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="py-2">
      <p className="text-[13.5px] font-medium text-[var(--color-ink)]">{title}</p>
      <p className="mt-[2px] text-[12px] leading-[1.45] text-[var(--color-ink-50)]">{desc}</p>
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
  const [existingConsent, setExistingConsent] = useState<PatientConsent | null>(null);
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

  function handleRefuse() {
    const confirmed = window.confirm(
      "Sans consentement, les données de ce patient ne peuvent pas être enregistrées. " +
        "Vous pouvez recueillir le consentement ultérieurement depuis le dossier patient.\n\n" +
        "Confirmer le refus ?",
    );
    if (confirmed) router.back();
  }

  async function handleAccept() {
    if (!patientId) {
      window.alert("Identifiant patient manquant.");
      return;
    }
    if (!signatureRef.current?.hasSignature()) {
      window.alert("Veuillez signer dans la zone prévue avant de valider le consentement.");
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
      window.alert("Impossible d'enregistrer le consentement. Veuillez réessayer.");
      console.error("[ConsentScreen]", e);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--color-ivory)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-ink-15)] border-t-[var(--color-ink)]" />
      </div>
    );
  }

  // ── Already consented ──────────────────────────────────────────────────────
  if (existingConsent) {
    return (
      <div className="flex flex-1 flex-col overflow-auto bg-[var(--color-ivory)]">
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
            Consentement
          </h1>
          <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-50)]">{patientName} · RGPD Art. 9</p>
        </div>

        <div className="mx-5 mt-4 rounded-[20px] bg-[var(--color-paper)] p-6 text-center" style={{ border: "1px solid var(--color-ink-08)" }}>
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5"
            style={{
              background: "rgba(76,124,91,0.08)",
              border: "1px solid rgba(76,124,91,0.28)",
              color: "var(--color-pspi-green)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-[11px] uppercase" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
              Consentement signé
            </span>
          </div>
          <p className="mt-4 text-[13px] text-[var(--color-ink-70)]">
            Signé le{" "}
            <strong className="text-[var(--color-ink)]">
              {new Date(existingConsent.timestamp).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
            </strong>
          </p>
          <p className="mt-2 text-[11px] text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)" }}>
            version v{existingConsent.version}
          </p>
          <p className="mt-1 text-[11px] text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)" }}>
            hash {existingConsent.signatureHash.slice(0, 16)}…
          </p>
          <button
            onClick={() => router.back()}
            className="mt-6 rounded-[12px] bg-[var(--color-ink)] px-6 py-2.5 text-[13px] font-medium text-[var(--color-ivory)]"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  // ── Formulaire de consentement ─────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col overflow-auto bg-[var(--color-ivory)]">
      {/* Top bar */}
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
          Consentement
        </h1>
        <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-50)]">{patientName} · RGPD Art. 9</p>
      </div>

      {/* Lead editorial */}
      <div className="px-7 pt-2 pb-3">
        <p
          className="text-[var(--color-ink)]"
          style={{ fontFamily: "var(--font-serif)", fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.3px" }}
        >
          Le patient consent à l&apos;analyse de ses expressions faciales à des fins d&apos;évaluation de la douleur.
        </p>
      </div>

      {/* Quick summary list */}
      <div className="px-5">
        <CheckRow title="Traitement local" desc="Les images ne quittent pas l'appareil." />
        <CheckRow title="Anonymisation" desc="Seuls les scores numériques sont conservés." />
        <CheckRow title="Durée" desc="Les données sont supprimables à tout moment." />
        <CheckRow title="Usage" desc="Aide à l'observation clinique uniquement." />
      </div>

      {/* Detailed sections */}
      <div className="mx-5 mt-5 rounded-[16px] bg-[var(--color-paper)] p-4" style={{ border: "1px solid var(--color-ink-08)" }}>
        <Label>1 — Présentation</Label>
        <p className="mt-2 text-[13.5px] leading-[1.5] text-[var(--color-ink-70)]">
          PainFace est un logiciel d&apos;aide à la rééducation utilisé par votre kinésithérapeute pour mesurer
          objectivement votre niveau de douleur au cours des séances. L&apos;application analyse en temps réel
          les micro-expressions de votre visage à l&apos;aide de la caméra de l&apos;appareil pour calculer un
          score de douleur (indice PSPI). Ce traitement est réalisé en local, directement sur l&apos;appareil —
          aucune donnée n&apos;est envoyée vers un serveur.
        </p>
      </div>

      <div className="mx-5 mt-3 rounded-[16px] bg-[var(--color-paper)] p-4" style={{ border: "1px solid var(--color-ink-08)" }}>
        <Label>2 — Données collectées</Label>
        <p className="mt-2 text-[13px] text-[var(--color-ink-70)]">
          Conformément au principe de minimisation (RGPD Art. 5.1.c) :
        </p>
        {[
          "Scores de douleur PSPI (0–16) et horodatages",
          "Durée des séances",
          "Notes cliniques du praticien",
          "Profil de calibration facial (seuils personnalisés)",
        ].map((it, i) => (
          <div key={i} className="flex items-center gap-2 mt-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--color-pspi-green)" }}
            />
            <span className="text-[12.5px] text-[var(--color-ink)]">{it}</span>
          </div>
        ))}

        <div className="mt-3 h-px" style={{ background: "var(--color-ink-08)" }} />

        <p className="mt-3 text-[13px] text-[var(--color-ink-70)]">Ne sont pas collectés :</p>
        {[
          "Images ou vidéos de votre visage",
          "Enregistrements audio",
          "Données de localisation",
          "Landmarks faciaux bruts (supprimés après calcul)",
          "Transmission vers un serveur distant",
        ].map((it, i) => (
          <div key={i} className="flex items-center gap-2 mt-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--color-ink-30)" }}
            />
            <span className="text-[12.5px] text-[var(--color-ink-70)]">{it}</span>
          </div>
        ))}

        <div
          className="mt-4 rounded-[10px] p-3"
          style={{ background: "rgba(47,75,138,0.06)", border: "1px solid rgba(47,75,138,0.18)" }}
        >
          <p className="text-[12.5px] leading-[1.5] text-[var(--color-accent-ink)]">
            Toutes les données sont stockées uniquement sur cet appareil. Votre kinésithérapeute est le seul à y avoir accès.
          </p>
        </div>
      </div>

      <div className="mx-5 mt-3 rounded-[16px] bg-[var(--color-paper)] p-4" style={{ border: "1px solid var(--color-ink-08)" }}>
        <Label>3 — Base légale et droits</Label>
        <p className="mt-2 text-[13px] text-[var(--color-ink-70)]">
          Le traitement est fondé sur votre consentement explicite (RGPD Art. 9.2.a) pour des données de santé dans le cadre d&apos;une prise en charge médicale.
        </p>
        <p className="mt-2 text-[13px] text-[var(--color-ink-70)]">Droits exerçables à tout moment :</p>
        <div className="mt-2">
          <RightItem title="Droit d'accès (Art. 15)" desc="Obtenir une copie de toutes vos données stockées." />
          <RightItem title="Droit de rectification (Art. 16)" desc="Corriger vos informations personnelles." />
          <RightItem title="Droit à l'effacement (Art. 17)" desc="Supprimer l'intégralité de votre dossier." />
          <RightItem title="Droit d'opposition (Art. 21)" desc="Retirer votre consentement sans préjudice." />
          <RightItem title="Droit à la portabilité (Art. 20)" desc="Exporter vos données dans un format lisible." />
        </div>
        <p className="mt-2 text-[12.5px] text-[var(--color-ink-50)]">
          Pour exercer ces droits, contactez votre kinésithérapeute. Vous pouvez également saisir la CNIL (www.cnil.fr).
        </p>
      </div>

      <div className="mx-5 mt-3 rounded-[16px] bg-[var(--color-paper)] p-4" style={{ border: "1px solid var(--color-ink-08)" }}>
        <Label>4 — Avertissement médical</Label>
        <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--color-ink-70)]">
          PainFace est un outil d&apos;aide à la décision clinique. Il ne remplace en aucun cas le jugement du professionnel de santé. Les scores affichés sont des estimations algorithmiques et ne constituent pas un diagnostic médical.
        </p>
      </div>

      {/* Signature */}
      <div className="px-5 mt-5">
        <Label>Signature du patient</Label>
        <div
          className="mt-2 overflow-hidden rounded-[14px] bg-[var(--color-paper)]"
          style={{ border: "1px dashed var(--color-ink-30)" }}
        >
          <SignatureCanvas
            ref={signatureRef}
            height={160}
            strokeColor="#14171C"
            strokeWidth={2}
            onSign={() => setSigned(true)}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] uppercase text-[var(--color-ink-50)]" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}>
            Formulaire v{CONSENT_VERSION} · SHA-256 vérifié
          </span>
          <button
            type="button"
            onClick={() => {
              signatureRef.current?.clear();
              setSigned(false);
            }}
            className="rounded-[8px] border border-[var(--color-ink-15)] bg-transparent px-3 py-1 text-[12px] text-[var(--color-ink-70)]"
          >
            Effacer
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2.5 px-5 pt-5 pb-8">
        <button
          type="button"
          onClick={handleRefuse}
          className="flex-1 rounded-[14px] py-3.5 text-[14px] font-medium transition-colors"
          style={{
            background: `rgba(176,68,71,0.05)`,
            color: "var(--color-pspi-rose)",
            border: "1px solid rgba(176,68,71,0.28)",
          }}
        >
          Refuser
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={!signed || saving}
          className="flex-[2] rounded-[14px] py-3.5 text-[14px] font-medium text-[var(--color-ivory)] transition-all"
          style={{
            background: signed && !saving ? "var(--color-ink)" : "var(--color-ink-30)",
            cursor: signed && !saving ? "pointer" : "not-allowed",
          }}
        >
          {saving ? (
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-ivory)] border-t-transparent" />
          ) : (
            "Signer et continuer"
          )}
        </button>
      </div>
    </div>
  );
}
