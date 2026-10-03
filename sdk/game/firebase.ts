import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { VybeGameClient, type GameCaptureTransport } from './index';

/** Requires the player's signed-in VYBE Firebase app, never an Admin SDK app. */
export function createFirebaseGameClient(app: FirebaseApp, region = 'us-central1'): VybeGameClient {
  const transport: GameCaptureTransport = {
    async call<T>(name: string, data: Record<string, unknown>) {
      if (!getAuth(app).currentUser) throw new Error('Sign in to VYBE before sharing a capture.');
      const result = await httpsCallable<Record<string, unknown>, T>(getFunctions(app, region), name)(data);
      return result.data;
    },
    async upload(receipt, media, options) {
      const uid = getAuth(app).currentUser?.uid;
      if (!uid || receipt.storagePath !== `game-captures/${uid}/${receipt.captureId}`) throw new Error('This upload belongs to another account.');
      if (options.signal?.aborted) throw new Error('Capture upload cancelled.');
      const task = uploadBytesResumable(ref(getStorage(app), receipt.storagePath), media, { contentType: receipt.contentType });
      const cancel = () => { task.cancel(); };
      options.signal?.addEventListener('abort', cancel, { once: true });
      try {
        await new Promise<void>((resolve, reject) => {
          task.on('state_changed', snapshot => options.onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0), reject, resolve);
        });
      } finally {
        options.signal?.removeEventListener('abort', cancel);
      }
    },
  };
  return new VybeGameClient(transport);
}
