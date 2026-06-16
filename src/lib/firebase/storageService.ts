import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getFirebaseApp } from './app';
import type { StorageUploadResult, StorageUrlResult, VybeAuthError } from './types';

const storage = getStorage(getFirebaseApp());

function toError(err: unknown): VybeAuthError {
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: (err as { message: string }).message };
  }
  return { message: 'Storage error' };
}

export function createStorageBucket(bucket: string) {
  return {
    async upload(
      path: string,
      file: File | Blob,
      _options?: { upsert?: boolean; contentType?: string; cacheControl?: string; duplex?: string },
    ): Promise<StorageUploadResult> {
      try {
        const storageRef = ref(storage, `${bucket}/${path}`);
        const metadata = _options?.contentType ? { contentType: _options.contentType } : undefined;
        await uploadBytes(storageRef, file, metadata);
        return { data: { path }, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    async download(path: string): Promise<{ data: Blob | null; error: VybeAuthError | null }> {
      try {
        const storageRef = ref(storage, `${bucket}/${path}`);
        const url = await getDownloadURL(storageRef);
        const res = await fetch(url);
        const blob = await res.blob();
        return { data: blob, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    getPublicUrl(path: string): StorageUrlResult {
      const storageRef = ref(storage, `${bucket}/${path}`);
      // Firebase download URLs are resolved async; return path-based placeholder.
      const publicUrl = `gs://${bucket}/${path}`;
      return { data: { publicUrl, signedUrl: publicUrl } };
    },

    async createSignedUrl(path: string, _expiresIn = 3600): Promise<{ data: { signedUrl: string } | null; error: VybeAuthError | null }> {
      try {
        const storageRef = ref(storage, `${bucket}/${path}`);
        const signedUrl = await getDownloadURL(storageRef);
        return { data: { signedUrl }, error: null };
      } catch (err) {
        return { data: null, error: toError(err) };
      }
    },

    async createSignedUrls(paths: string[], expiresIn = 3600): Promise<{ data: Array<{ path: string; signedUrl: string; error?: string | null }> | null; error: VybeAuthError | null }> {
      try {
        const data = await Promise.all(paths.map(async (p) => {
          try {
            const u = await getDownloadURL(ref(storage, `${bucket}/${p}`));
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
      try {
        await Promise.all(paths.map((p) => deleteObject(ref(storage, `${bucket}/${p}`))));
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
    try {
      return await getDownloadURL(ref(storage, `${bucket}/${path}`));
    } catch {
      return null;
    }
  },

  /** Parse legacy Supabase storage URLs and resolve to Firebase download URL when possible. */
  async resolveMediaUrl(url: string): Promise<string> {
    if (!url) return url;
    if (url.startsWith('http') && !url.includes('db.co/storage')) return url;

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
