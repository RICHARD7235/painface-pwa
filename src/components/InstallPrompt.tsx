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
      <div
        className="mx-auto max-w-md rounded-[20px] bg-[var(--color-ivory)] p-4"
        style={{
          border: "1px solid var(--color-ink-08)",
          boxShadow: "0 20px 40px rgba(20,23,28,0.12)",
        }}
      >
        {kind === "android" ? (
          /* ---- Android / Chrome ---- */
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div
                className="h-10 w-10 flex-shrink-0 rounded-[10px] flex items-center justify-center"
                style={{ background: "var(--color-ink)", color: "var(--color-ivory)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[var(--color-ink)]"
                  style={{ fontFamily: "var(--font-serif)", fontSize: 20, letterSpacing: "-0.3px", lineHeight: 1.1 }}
                >
                  Installer PainFace
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-ink-70)] leading-[1.45]">
                  Accédez à l&apos;app directement depuis votre écran d&apos;accueil, même hors-ligne.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDismiss}
                className="flex-1 rounded-[12px] py-2.5 text-[12px] font-medium text-[var(--color-ink-70)] transition-colors"
                style={{ border: "1px solid var(--color-ink-15)" }}
              >
                Plus tard
              </button>
              <button
                onClick={handleInstall}
                className="flex-1 rounded-[12px] py-2.5 text-[12px] font-medium text-[var(--color-ivory)]"
                style={{ background: "var(--color-ink)" }}
              >
                Installer
              </button>
            </div>
          </div>
        ) : (
          /* ---- iOS Safari ---- */
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div
                className="h-10 w-10 flex-shrink-0 rounded-[10px] flex items-center justify-center"
                style={{ background: "var(--color-ink)", color: "var(--color-ivory)" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[var(--color-ink)]"
                  style={{ fontFamily: "var(--font-serif)", fontSize: 20, letterSpacing: "-0.3px", lineHeight: 1.1 }}
                >
                  Installer PainFace
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-ink-70)] leading-[1.5]">
                  Appuyez sur{" "}
                  <span className="inline-flex items-center align-middle mx-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent-ink)" }}>
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </span>{" "}
                  <strong className="text-[var(--color-ink)]">Partager</strong> puis{" "}
                  <strong className="text-[var(--color-ink)]">Sur l&apos;écran d&apos;accueil</strong>.
                </p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="w-full rounded-[12px] py-2.5 text-[12px] font-medium text-[var(--color-ink-70)]"
              style={{ border: "1px solid var(--color-ink-15)" }}
            >
              J&apos;ai compris
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
