import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getFirebaseApp } from './app';
import { getFirebaseConfig, isFirebaseConfigured } from './config';
import type { StorageUploadResult, StorageUrlResult, VybeAuthError } from './types';

let storageInstance: ReturnType<typeof getStorage> | null = null;

const NOT_CONFIGURED: VybeAuthError = {
  message: 'Firebase Storage is not configured. Set VITE_FIREBASE_* variables.',
};

function resolveStorage(): ReturnType<typeof getStorage> | null {
  if (!isFirebaseConfigured()) return null;
  if (!storageInstance) storageInstance = getStorage(getFirebaseApp());
  return storageInstance;
}

function toError(err: unknown): VybeAuthError {
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: (err as { message: string }).message };
  }
  return { message: 'Storage error' };
}

/** Map Supabase-style bucket + path or migrated GCS paths to a Firebase Storage object path. */
function storageObjectPath(bucket: string, path: string): string {
  let objectPath = path.replace(/^\/+/, '');
  try {
    const configBucket = getFirebaseConfig().storageBucket;
    const isGcsBucket =
      bucket === configBucket ||
      bucket.endsWith('.firebasestorage.app') ||
      bucket.endsWith('.appspot.com');
    if (isGcsBucket) {
      if (objectPath.startsWith(`${bucket}/`)) {
        objectPath = objectPath.slice(bucket.length + 1);
      }
      if (configBucket && objectPath.startsWith(`${configBucket}/`)) {
        objectPath = objectPath.slice(configBucket.length + 1);
      }
      return objectPath;
    }
  } catch {
    /* Firebase not configured — fall through */
  }
  return `${bucket}/${objectPath}`;
}

export function createStorageBucket(bucket: string) {
  return {
    async upload(
      path: string,
      file: File | Blob,
      _options?: { upsert?: boolean; contentType?: string; cacheControl?: string; duplex?: string },
    ): Promise<StorageUploadResult> {
      const storage = resolveStorage();
      if (!storage) return { data: null, error: NOT_CONFIGURED };
      try {
        const storageRef = ref(storage, storageObjectPath(bucket, path));
        const metadata = _options?.contentType ? { contentType: _options.contentType } : undefined;
        await uploadBytes(storageRef, file, metadata);
        return { data: { path }, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    async download(path: string): Promise<{ data: Blob | null; error: VybeAuthError | null }> {
      const storage = resolveStorage();
      if (!storage) return { data: null, error: NOT_CONFIGURED };
      try {
        const storageRef = ref(storage, storageObjectPath(bucket, path));
        const url = await getDownloadURL(storageRef);
        const res = await fetch(url);
        const blob = await res.blob();
        return { data: blob, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    getPublicUrl(path: string): StorageUrlResult {
      const storage = resolveStorage();
      if (!storage) {
        return { data: { publicUrl: '', signedUrl: '' } };
      }
      const storageRef = ref(storage, storageObjectPath(bucket, path));
      // Firebase download URLs are resolved async; return path-based placeholder.
      // `bucket` is the Supabase-compatible logical collection (for example
      // "media"), not the physical Firebase bucket. Persist the reference's
      // real bucket/fullPath so resolveMediaUrl can call getDownloadURL later.
      const publicUrl = `gs://${storageRef.bucket}/${storageRef.fullPath}`;
      return { data: { publicUrl, signedUrl: publicUrl } };
    },

    async createSignedUrl(path: string, _expiresIn = 3600): Promise<{ data: { signedUrl: string } | null; error: VybeAuthError | null }> {
      const storage = resolveStorage();
      if (!storage) return { data: null, error: NOT_CONFIGURED };
      try {
        const storageRef = ref(storage, storageObjectPath(bucket, path));
        const signedUrl = await getDownloadURL(storageRef);
        return { data: { signedUrl }, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    async createSignedUrls(paths: string[], expiresIn = 3600): Promise<{ data: Array<{ path: string; signedUrl: string; error?: string | null }> | null; error: VybeAuthError | null }> {
      const storage = resolveStorage();
      if (!storage) return { data: null, error: NOT_CONFIGURED };
      try {
        const data = await Promise.all(paths.map(async (p) => {
          try {
            const u = await getDownloadURL(ref(storage, storageObjectPath(bucket, p)));
            return { path: p, signedUrl: u, error: null };
          } catch (e: any) {
            return { path: p, signedUrl: '', error: e?.message || 'failed' };
          }
        }));
        return { data, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    async remove(paths: string[]): Promise<{ error: VybeAuthError | null }> {
      const storage = resolveStorage();
      if (!storage) return { error: NOT_CONFIGURED };
      try {
        await Promise.all(paths.map((p) => deleteObject(ref(storage, storageObjectPath(bucket, p)))));
        return { error: null };
      } catch (err) {
        return { error: toError(err) };
      }
    },

    from(path: string) {
      return createStorageBucket(`${bucket}/${path}`);
    },
  };
}

export const firebaseStorage = {
  from(bucket: string) {
    return createStorageBucket(bucket);
  },

  async resolveDownloadUrl(bucket: string, path: string): Promise<string | null> {
    const storage = resolveStorage();
    if (!storage) return null;
    try {
      return await getDownloadURL(ref(storage, storageObjectPath(bucket, path)));
    } catch {
      return null;
    }
  },

  /** Parse legacy Supabase storage URLs and resolve to Firebase download URL when possible. */
  async resolveMediaUrl(url: string): Promise<string> {
    if (!url) return url;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;

    const fbMatch = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
    if (fbMatch) {
      const path = decodeURIComponent(fbMatch[2]!.replace(/\+/g, ' '));
      const resolved = await this.resolveDownloadUrl(fbMatch[1]!, path);
      if (resolved) return resolved;
      return url;
    }

    if (url.startsWith('http') && !url.includes('/storage/v1/object/')) return url;

    const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (publicMatch) {
      const resolved = await this.resolveDownloadUrl(publicMatch[1]!, publicMatch[2]!);
      return resolved || url;
    }

    const gsMatch = url.match(/^gs:\/\/([^/]+)\/(.+)$/);
    if (gsMatch) {
      const resolved = await this.resolveDownloadUrl(gsMatch[1]!, gsMatch[2]!);
      return resolved || url;
    }

    return url;
  },
};
