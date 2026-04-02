"use client";

/**
 * SignatureCanvas -- Zone de signature numerique (HTML Canvas 2D).
 *
 * Supporte mouse + touch. Le trace brut n'est jamais persiste ;
 * seul son hash SHA-256 est conserve (cf. EncryptionService.sha256).
 *
 * Ref API :
 *   clear()       -- efface le canvas
 *   toDataURL()   -- retourne le contenu du canvas en data URL (pour hash)
 *   hasSignature() -- true si au moins un trait a ete trace
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SignatureCanvasRef {
  clear: () => void;
  /** Retourne le contenu du canvas en data URL PNG */
  toDataURL: () => string;
  hasSignature: () => boolean;
}

interface Props {
  /** Hauteur du canvas (px). Defaut : 200 */
  height?: number;
  /** Couleur du trait. Defaut : '#000000' */
  strokeColor?: string;
  /** Epaisseur du trait (px). Defaut : 2 */
  strokeWidth?: number;
  /** Appele des qu'un trait est termine */
  onSign?: () => void;
}

// ── Composant ────────────────────────────────────────────────────────────────

const SignatureCanvas = forwardRef<SignatureCanvasRef, Props>(
  function SignatureCanvas(
    { height = 200, strokeColor = "#000000", strokeWidth = 2, onSign },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawingRef = useRef(false);
    const [hasSigned, setHasSigned] = useState(false);

    // ── Imperative API ─────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      clear() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Redessiner le fond blanc
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasSigned(false);
      },
      toDataURL() {
        return canvasRef.current?.toDataURL("image/png") ?? "";
      },
      hasSignature() {
        return hasSigned;
      },
    }));

    // ── Helpers dessin ─────────────────────────────────────────────────────

    const getPosition = useCallback(
      (
        e: MouseEvent | TouchEvent,
        canvas: HTMLCanvasElement,
      ): { x: number; y: number } => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        if ("touches" in e && e.touches.length > 0) {
          const touch = e.touches[0];
          return {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY,
          };
        }
        const mouse = e as MouseEvent;
        return {
          x: (mouse.clientX - rect.left) * scaleX,
          y: (mouse.clientY - rect.top) * scaleY,
        };
      },
      [],
    );

    const startDraw = useCallback(
      (e: MouseEvent | TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        isDrawingRef.current = true;
        const pos = getPosition(e, canvas);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      },
      [getPosition],
    );

    const draw = useCallback(
      (e: MouseEvent | TouchEvent) => {
        if (!isDrawingRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const pos = getPosition(e, canvas);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      },
      [getPosition],
    );

    const endDraw = useCallback(() => {
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      setHasSigned(true);
      onSign?.();
    }, [onSign]);

    // ── Setup canvas + listeners ───────────────────────────────────────────

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Ajuster la resolution au devicePixelRatio pour nettete
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Fond blanc
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Style du trait
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // ── Mouse events ──────────────────────────────────────────────────
      const onMouseDown = (e: MouseEvent) => {
        e.preventDefault();
        startDraw(e);
      };
      const onMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        draw(e);
      };
      const onMouseUp = (e: MouseEvent) => {
        e.preventDefault();
        endDraw();
      };

      // ── Touch events ──────────────────────────────────────────────────
      const onTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        startDraw(e);
      };
      const onTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        draw(e);
      };
      const onTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        endDraw();
      };

      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("mousemove", onMouseMove);
      canvas.addEventListener("mouseup", onMouseUp);
      canvas.addEventListener("mouseleave", onMouseUp);
      canvas.addEventListener("touchstart", onTouchStart, { passive: false });
      canvas.addEventListener("touchmove", onTouchMove, { passive: false });
      canvas.addEventListener("touchend", onTouchEnd);

      return () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("mousemove", onMouseMove);
        canvas.removeEventListener("mouseup", onMouseUp);
        canvas.removeEventListener("mouseleave", onMouseUp);
        canvas.removeEventListener("touchstart", onTouchStart);
        canvas.removeEventListener("touchmove", onTouchMove);
        canvas.removeEventListener("touchend", onTouchEnd);
      };
    }, [strokeColor, strokeWidth, startDraw, draw, endDraw]);

    // ── Rendu ──────────────────────────────────────────────────────────────

    return (
      <div className="relative w-full" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-lg border-[1.5px] border-slate-300 bg-white touch-none"
          style={{ height }}
        />
        {/* Placeholder */}
        {!hasSigned && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-slate-400 italic">
              Signez ici avec votre doigt ou votre souris
            </span>
          </div>
        )}
      </div>
    );
  },
);

SignatureCanvas.displayName = "SignatureCanvas";

export default SignatureCanvas;
