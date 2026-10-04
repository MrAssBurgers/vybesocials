import type { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { VybeGameClient, type GameCaptureTransport } from './index';

/** Requires the player's signed-in VYBE Firebase app, never an Admin SDK app. */
export function createFirebaseGameClient(app: FirebaseApp, region = 'us-central1'): VybeGameClient {
  const transport: GameCaptureTransport = {
    beginOperation() {
      const auth = getAuth(app), owner = auth.currentUser;
      if (!owner) throw new Error('Sign in to VYBE before sharing a capture.');
      let changed = false;
      const unsubscribe = auth.onAuthStateChanged(user => { if (user !== owner) changed = true; });
      return {
        expectedOwnerUid: owner.uid,
        assertCurrent() {
          if (changed || auth.currentUser !== owner) throw new Error('Your VYBE account changed. Start this capture action again.');
        },
        dispose: unsubscribe,
      };
    },
    async call<T>(name: string, data: Record<string, unknown>) {
      if (!getAuth(app).currentUser) throw new Error('Sign in to VYBE before sharing a capture.');
      const result = await httpsCallable<Record<string, unknown>, T>(getFunctions(app, region), name)(data);
      return result.data;
    },
    async upload(receipt, media, options) {
      const auth = getAuth(app), owner = auth.currentUser;
      const uid = owner?.uid;
      if (!uid || receipt.storagePath !== `game-captures/${uid}/${receipt.captureId}`) throw new Error('This upload belongs to another account.');
      if (options.signal?.aborted) throw new Error('Capture upload cancelled.');
      const task = uploadBytesResumable(ref(getStorage(app), receipt.storagePath), media, { contentType: receipt.contentType });
      const cancel = () => { task.cancel(); };
      options.signal?.addEventListener('abort', cancel, { once: true });
      const unsubscribe = auth.onAuthStateChanged(user => { if (user !== owner) cancel(); });
      try {
        await new Promise<void>((resolve, reject) => {
          task.on('state_changed', snapshot => {
            if (auth.currentUser !== owner) { cancel(); return; }
            options.onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0);
          }, reject, resolve);
        });
      } finally {
        options.signal?.removeEventListener('abort', cancel);
        unsubscribe();
      }
    },
  };
  return new VybeGameClient(transport);
}
