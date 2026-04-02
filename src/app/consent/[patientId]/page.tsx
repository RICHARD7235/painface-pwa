"use client";

/**
 * ConsentScreen -- Formulaire de consentement RGPD patient (Art. 9).
 *
 * Sections :
 *   1. Presentation de l'application et du traitement
 *   2. Ce qui est collecte (scores / jamais d'images)
 *   3. Bases legales et droits du patient (Art. 15-22)
 *   4. Disclaimer medical
 *   5. Signature numerique
 *   6. Boutons Refuser / Accepter et signer
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
    <h2 className="text-xs font-bold text-slate-600 uppercase tracking-wide px-4 pt-5 pb-2">
      {children}
    </h2>
  );
}

function CheckItem({ ok, children }: { ok: boolean; children: string }) {
  return (
    <div className="flex items-start gap-2 mb-1.5">
      <span
        className={`text-sm font-bold w-5 text-center shrink-0 ${ok ? "text-green-600" : "text-red-600"}`}
      >
        {ok ? "\u2713" : "\u2717"}
      </span>
      <span className="text-sm leading-[21px] text-slate-700">{children}</span>
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
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-[13px] text-slate-500 mt-0.5 leading-[18px]">
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

  // Donnees chargees async
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
      "Sans consentement, les donnees de ce patient ne peuvent pas etre enregistrees. " +
        "Vous pouvez recueillir le consentement ulterieurement depuis le dossier patient.\n\n" +
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
        "Veuillez signer dans la zone prevue avant de valider le consentement.",
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
        "Impossible d'enregistrer le consentement. Veuillez reessayer.",
      );
      console.error("[ConsentScreen]", e);
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Already consented ──────────────────────────────────────────────────────

  if (existingConsent) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-indigo-700 text-center pt-10 pb-6 px-5">
          <p className="text-4xl mb-2">&#x1F512;</p>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Consentement RGPD
          </h1>
          <p className="text-sm text-indigo-200 font-medium mt-1">
            Patient : {patientName}
          </p>
        </div>
        <div className="max-w-xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-full px-4 py-2 mb-4">
              <span className="text-lg">&#x2705;</span>
              <span className="font-semibold text-sm">
                Consentement enregistre
              </span>
            </div>
            <p className="text-sm text-slate-600 mb-2">
              Le consentement a ete signe le{" "}
              <strong>
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
            <p className="text-xs text-slate-400">
              Version du formulaire : v{existingConsent.version}
            </p>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Hash : {existingConsent.signatureHash.slice(0, 16)}...
            </p>
            <button
              onClick={() => router.back()}
              className="mt-6 px-6 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors"
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
    <div className="min-h-screen bg-slate-50">
      <div className="overflow-y-auto">
        {/* ── En-tete ─────────────────────────────────────────────────────── */}
        <div className="bg-indigo-700 text-center pt-10 pb-6 px-5">
          <p className="text-4xl mb-2">&#x1F512;</p>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Consentement RGPD
          </h1>
          <p className="text-sm text-indigo-200 font-medium mt-1">
            Patient : {patientName}
          </p>
          <p className="text-xs text-indigo-300 mt-0.5">
            Date :{" "}
            {new Date().toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>

        <div className="max-w-xl mx-auto pb-8">
          {/* ── 1. Presentation ─────────────────────────────────────────── */}
          <SectionTitle>{"1. Presentation de l'application"}</SectionTitle>
          <div className="bg-white mx-4 rounded-xl border border-slate-200 p-4">
            <p className="text-sm leading-[21px] text-slate-700">
              PainFace est un logiciel d&apos;aide a la reeducation utilise par
              votre kinesitherapeute pour mesurer objectivement votre niveau de
              douleur au cours des seances de soins.
            </p>
            <p className="text-sm leading-[21px] text-slate-700 mt-2.5">
              L&apos;application analyse en temps reel les micro-expressions de
              votre visage a l&apos;aide de la camera de l&apos;appareil pour
              calculer un score de douleur (indice PSPI). Ce traitement est
              realise en local, directement sur l&apos;appareil — aucune donnee
              n&apos;est envoyee vers un serveur.
            </p>
          </div>

          {/* ── 2. Donnees collectees ───────────────────────────────────── */}
          <SectionTitle>{"2. Donnees collectees"}</SectionTitle>
          <div className="bg-white mx-4 rounded-xl border border-slate-200 p-4">
            <p className="text-sm leading-[21px] text-slate-700 mb-2.5">
              Conformement au principe de minimisation des donnees (RGPD Art.
              5.1.c) :
            </p>
            <CheckItem ok>
              Scores de douleur PSPI (0-16) et horodatages
            </CheckItem>
            <CheckItem ok>Duree des seances</CheckItem>
            <CheckItem ok>Notes cliniques du praticien</CheckItem>
            <CheckItem ok>
              Profil de calibration facial (seuils de mesure personnalises)
            </CheckItem>

            <div className="h-px bg-slate-100 my-2.5" />

            <CheckItem ok={false}>
              Images ou videos de votre visage
            </CheckItem>
            <CheckItem ok={false}>
              Enregistrements audio ou visuels
            </CheckItem>
            <CheckItem ok={false}>Donnees de localisation</CheckItem>
            <CheckItem ok={false}>
              Landmarks faciaux bruts (supprimes immediatement apres calcul)
            </CheckItem>
            <CheckItem ok={false}>
              Transmission vers un serveur distant
            </CheckItem>

            <div className="bg-blue-50 rounded-lg p-3 mt-3 border-l-[3px] border-l-blue-500">
              <p className="text-[13px] leading-[19px] text-blue-700">
                &#x1F4F1; Toutes les donnees sont stockees uniquement sur cet
                appareil. Votre kinesitherapeute est le seul a y avoir acces.
              </p>
            </div>
          </div>

          {/* ── 3. Bases legales & droits ──────────────────────────────── */}
          <SectionTitle>{"3. Base legale et vos droits"}</SectionTitle>
          <div className="bg-white mx-4 rounded-xl border border-slate-200 p-4">
            <p className="text-sm leading-[21px] text-slate-700">
              Le traitement est fonde sur votre consentement explicite (RGPD
              Art. 9.2.a) pour des donnees de sante dans le cadre d&apos;une
              prise en charge medicale.
            </p>
            <p className="text-sm leading-[21px] text-slate-700 mt-2.5">
              Vous disposez des droits suivants, exercables a tout moment :
            </p>

            <div className="mt-3">
              <RightItem
                emoji="&#x1F4CB;"
                title="Droit d'acces (Art. 15)"
                desc="Obtenir une copie de toutes vos donnees stockees."
              />
              <RightItem
                emoji="&#x270F;&#xFE0F;"
                title="Droit de rectification (Art. 16)"
                desc="Corriger vos informations personnelles (nom, date de naissance)."
              />
              <RightItem
                emoji="&#x1F5D1;&#xFE0F;"
                title="Droit a l'effacement (Art. 17)"
                desc="Supprimer l'integralite de votre dossier, y compris toutes les seances."
              />
              <RightItem
                emoji="&#x1F6AB;"
                title="Droit d'opposition (Art. 21)"
                desc="Retirer votre consentement a tout moment sans prejudice."
              />
              <RightItem
                emoji="&#x1F4E6;"
                title="Droit a la portabilite (Art. 20)"
                desc="Exporter vos donnees dans un format lisible."
              />
            </div>

            <p className="text-sm leading-[21px] text-slate-700 mt-2.5">
              Pour exercer ces droits, contactez votre kinesitherapeute. Vous
              pouvez egalement saisir la CNIL (www.cnil.fr) en cas de litige.
            </p>
          </div>

          {/* ── 4. Avertissement medical ──────────────────────────────── */}
          <SectionTitle>{"4. Avertissement medical"}</SectionTitle>
          <div className="bg-white mx-4 rounded-xl border border-slate-200 p-4">
            <div className="bg-amber-50 rounded-lg p-3 border-l-[3px] border-l-amber-500">
              <p className="text-[13px] leading-[19px] text-amber-800 font-medium">
                &#x26A0;&#xFE0F; PainFace est un outil d&apos;aide a la
                decision clinique. Il ne remplace en aucun cas le jugement du
                professionnel de sante. Les scores affiches sont des estimations
                algorithmiques et ne constituent pas un diagnostic medical.
              </p>
            </div>
          </div>

          {/* ── 5. Declaration de consentement ────────────────────────── */}
          <SectionTitle>{"5. Declaration de consentement"}</SectionTitle>
          <div className="bg-white mx-4 rounded-xl border border-slate-200 p-4">
            <p className="text-sm leading-[21px] text-slate-700">
              En signant ci-dessous, je declare :
            </p>
            <p className="text-sm leading-[22px] text-slate-700 mt-1">
              &bull; Avoir pris connaissance des informations ci-dessus
            </p>
            <p className="text-sm leading-[22px] text-slate-700 mt-1">
              &bull; Comprendre la nature et la finalite du traitement de mes
              donnees
            </p>
            <p className="text-sm leading-[22px] text-slate-700 mt-1">
              &bull; Consentir librement au traitement de mes donnees de sante
              par cet outil dans le cadre de ma prise en charge
              kinesitherapeutique
            </p>
            <p className="text-sm leading-[22px] text-slate-700 mt-1 mb-1">
              &bull; Avoir ete informe(e) de mon droit de retrait a tout moment
            </p>
          </div>

          {/* ── 6. Zone de signature ──────────────────────────────────── */}
          <SectionTitle>{"6. Signature du patient"}</SectionTitle>
          <div className="mx-4 space-y-2">
            <SignatureCanvas
              ref={signatureRef}
              height={200}
              strokeColor="#000000"
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
                className="px-3.5 py-1.5 rounded-md bg-slate-100 text-slate-500 text-[13px] font-medium hover:bg-slate-200 transition-colors"
              >
                Effacer
              </button>
            </div>
          </div>

          {/* ── Version du formulaire ─────────────────────────────────── */}
          <p className="text-[11px] text-slate-400 text-center mt-3">
            Formulaire de consentement v{CONSENT_VERSION}
          </p>

          {/* ── Boutons Refuser / Accepter ─────────────────────────────── */}
          <div className="flex gap-3 mx-4 mt-5 pb-5">
            <button
              type="button"
              onClick={handleRefuse}
              className="flex-1 py-4 rounded-xl border-[1.5px] border-red-600 bg-white text-red-600 font-semibold text-[15px] hover:bg-red-50 transition-colors"
            >
              Refuser
            </button>

            <button
              type="button"
              onClick={handleAccept}
              disabled={!signed || saving}
              className={`flex-[2] py-4 rounded-xl font-bold text-[15px] text-white transition-colors ${
                signed && !saving
                  ? "bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/30"
                  : "bg-indigo-300 cursor-not-allowed"
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
    </div>
  );
}
