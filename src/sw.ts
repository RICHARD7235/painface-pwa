/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, Serwist, ExpirationPlugin } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & WorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Cache MediaPipe WASM files
    {
      matcher: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision/,
      handler: new CacheFirst({
        cacheName: 'mediapipe-wasm',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 20,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    // Cache MediaPipe model files
    {
      matcher: /^https:\/\/storage\.googleapis\.com\/mediapipe-models/,
      handler: new CacheFirst({
        cacheName: 'mediapipe-models',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 5,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
