"use client";

import { useEffect, useState, useCallback, useRef } from "react";

// ---- Types --------------------------------------------------------------- //

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PromptKind = "android" | "ios" | null;

// ---- Helpers ------------------------------------------------------------- //

const STORAGE_KEY = "painface-install-dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismiss(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* quota / private mode */
  }
}

// ---- Component ----------------------------------------------------------- //

export default function InstallPrompt() {
  const [kind, setKind] = useState<PromptKind>(null);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  // Listen for the native install prompt (Chromium-based browsers)
  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setKind("android");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  // Detect iOS Safari (no beforeinstallprompt event)
  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;
    if (isIOSSafari()) setKind("ios");
  }, []);

  const handleInstall = useCallback(async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setKind(null);
    }
    deferredPrompt.current = null;
  }, []);

  const handleDismiss = useCallback(() => {
    persistDismiss();
    setKind(null);
  }, []);

  if (!kind) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 px-4 animate-slide-up"
      style={{ bottom: "max(16px, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-[#141827]/90 backdrop-blur-xl p-4 shadow-2xl shadow-indigo-500/10">
        {kind === "android" ? (
          /* ---- Android / Chrome ---- */
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Installer PainFace</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Accédez à l&apos;app directement depuis votre écran d&apos;accueil, même hors-ligne.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 rounded-xl py-2.5 text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
              >
                Plus tard
              </button>
              <button
                onClick={handleInstall}
                className="flex-1 rounded-xl py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 transition-all shadow-lg shadow-indigo-500/25"
              >
                Installer
              </button>
            </div>
          </div>
        ) : (
          /* ---- iOS Safari ---- */
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Installer PainFace</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Appuyez sur{" "}
                  <span className="inline-flex items-center align-middle mx-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </span>{" "}
                  <strong className="text-white">Partager</strong> puis{" "}
                  <strong className="text-white">Sur l&apos;écran d&apos;accueil</strong>.
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="w-full rounded-xl py-2.5 text-xs font-medium text-slate-400 hover:text-slate-300 transition-colors"
            >
              J&apos;ai compris
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
