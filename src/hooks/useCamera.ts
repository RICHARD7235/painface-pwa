"use client";

import { useRef, useState, useEffect, useCallback } from 'react';

export type CameraPermission = 'prompt' | 'granted' | 'denied';

export interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  permission: CameraPermission;
  startCamera: (facingMode?: 'user' | 'environment') => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => Promise<void>;
  error: string | null;
}

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermission>('prompt');
  const [error, setError] = useState<string | null>(null);
  const facingModeRef = useRef<'user' | 'environment'>('user');

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  }, [stream]);

  const startCamera = useCallback(
    async (facingMode: 'user' | 'environment' = 'user') => {
      try {
        setError(null);
        facingModeRef.current = facingMode;

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('muted', 'true');
          await videoRef.current.play();
        }

        setStream(mediaStream);
        setPermission('granted');
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Erreur caméra inconnue';
        setError(msg);
        if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
          setPermission('denied');
        }
      }
    },
    [],
  );

  const switchCamera = useCallback(async () => {
    stream?.getTracks().forEach((t) => t.stop());
    const next = facingModeRef.current === 'user' ? 'environment' : 'user';
    await startCamera(next);
  }, [stream, startCamera]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    videoRef,
    stream,
    permission,
    startCamera,
    stopCamera,
    switchCamera,
    error,
  };
}
