/** VYBE Game Capture SDK v1 — engine-neutral transport, no privileged keys. */
export const CAPTURE_LIMIT_BYTES = 48 * 1024 * 1024;
export type CaptureMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'video/mp4' | 'video/webm';
export type CapturePhase = 'preparing' | 'uploading' | 'verifying' | 'ready';
export interface CaptureReceipt {
  captureId: string;
  status: 'uploading' | 'ready' | 'imported' | 'cancelled' | 'expired';
  gameId: string;
  gameName: string;
  contentType: CaptureMime;
  byteSize: number;
  caption: string;
  tags: string[];
  storagePath: string;
  expiresAt: number;
  reviewUrl: string;
  postId: string | null;
}
export interface CaptureRequest {
  gameId: string;
  /** Persist one key per capture; reuse it after network failures. */
  idempotencyKey: string;
  contentType: CaptureMime;
  media: Blob | Uint8Array;
  caption?: string;
  tags?: string[];
  signal?: AbortSignal;
  /** Bytes transferred only; 100% is not a ready or published acknowledgement. */
  onProgress?: (fraction: number) => void;
  /** Persist this ID immediately so cancellation can discard the private draft. */
  onCaptureReserved?: (captureId: string) => void;
  /** "ready" means reviewable; only receipt.status === "imported" means published. */
  onPhase?: (phase: CapturePhase) => void;
}
export interface GameCaptureTransport {
  /** Bind one SDK operation to the current account; always released on settlement. */
  beginOperation?(): { assertCurrent(): void; dispose(): void; expectedOwnerUid: string };
  call<T>(name: string, data: Record<string, unknown>): Promise<T>;
  /** Upload only to receipt.storagePath, as the signed-in Firebase user. */
  upload(receipt: CaptureReceipt, media: Blob | Uint8Array, options: { signal?: AbortSignal; onProgress?: (fraction: number) => void }): Promise<void>;
}

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Capture upload cancelled.');
}

/** No method silently publishes content or opens a browser window. */
export class VybeGameClient {
  constructor(private readonly transport: GameCaptureTransport) {}

  private async withOperation<T>(action: (transport: GameCaptureTransport, guard: () => void) => Promise<T>): Promise<T> {
    const operation = this.transport.beginOperation?.();
    let closed = false;
    const guard = () => {
      if (closed) throw new Error('This capture operation has ended.');
      operation?.assertCurrent();
    };
    const transport: GameCaptureTransport = {
      call: async <R>(name: string, data: Record<string, unknown>) => {
        guard();
        let result: R;
        try { result = await this.transport.call<R>(name, operation ? { ...data, expectedOwnerUid: operation.expectedOwnerUid } : data); }
        catch (error) { guard(); throw error; }
        guard();
        return result;
      },
      upload: async (receipt, media, options) => {
        guard();
        try { await this.transport.upload(receipt, media, { ...options, onProgress: fraction => {
          // Progress can arrive after cancellation or an account transition.
          try { guard(); } catch { return; }
          options.onProgress?.(fraction);
        } }); } catch (error) { guard(); throw error; }
        guard();
      },
    };
    try { guard(); const result = await action(transport, guard); guard(); return result; }
    finally { closed = true; operation?.dispose(); }
  }

  stageCapture(input: CaptureRequest): Promise<CaptureReceipt> {
    return this.withOperation((transport, guard) => this.stageCaptureForSession(input, transport, guard));
  }

  private async stageCaptureForSession(request: CaptureRequest, transport: GameCaptureTransport, guard: () => void): Promise<CaptureReceipt> {
    const input = { ...request, tags: request.tags ? [...request.tags] : undefined };
    aborted(input.signal);
    const byteSize = input.media instanceof Uint8Array ? input.media.byteLength : input.media.size;
    if (!Number.isSafeInteger(byteSize) || byteSize < 12 || byteSize > CAPTURE_LIMIT_BYTES) throw new Error('Captures must be between 12 bytes and 48 MiB.');
    if (!['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'].includes(input.contentType)) throw new Error('Unsupported capture format.');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)) throw new Error('A unique upload key of 8–128 characters is required.');
    const media = input.media instanceof Uint8Array ? new Uint8Array(input.media) : input.media;
    const phase = (value: CapturePhase) => { guard(); input.onPhase?.(value); guard(); };
    const progress = (value: number) => { guard(); input.onProgress?.(value); guard(); };
    phase('preparing'); aborted(input.signal);
    const receipt = await transport.call<CaptureReceipt>('createGameCapture', {
      gameId: input.gameId, idempotencyKey: input.idempotencyKey, contentType: input.contentType,
      byteSize, caption: input.caption ?? '', tags: input.tags ?? [],
    });
    if (!/^[a-f0-9]{48}$/.test(receipt.captureId) || receipt.byteSize !== byteSize || receipt.contentType !== input.contentType || receipt.gameId !== input.gameId) throw new Error('Invalid capture response.');
    guard(); input.onCaptureReserved?.(receipt.captureId);
    guard();
    aborted(input.signal);
    if (receipt.status === 'ready' || receipt.status === 'imported') { progress(1); phase('ready'); return receipt; }
    if (receipt.status !== 'uploading') throw new Error('This capture is no longer available.');
    // A previous upload may have completed even if its network response was lost.
    // Probe before uploading again: storage intentionally refuses overwrites.
    try {
      phase('verifying'); aborted(input.signal);
      const resumed = await transport.call<CaptureReceipt>('finishGameCapture', { captureId: receipt.captureId });
      aborted(input.signal);
      if (resumed.captureId !== receipt.captureId || !['ready', 'imported'].includes(resumed.status)) throw new Error('Capture verification was not confirmed.');
      progress(1); phase('ready'); return resumed;
    } catch (error) {
      const details = typeof error === 'object' && error && 'details' in error ? error.details : null;
      if (!details || typeof details !== 'object' || !('reason' in details) || details.reason !== 'upload-required') throw error;
    }
    aborted(input.signal);
    phase('uploading'); aborted(input.signal);
    await transport.upload(receipt, media, { signal: input.signal, onProgress: input.onProgress });
    aborted(input.signal);
    phase('verifying'); aborted(input.signal);
    const completed = await transport.call<CaptureReceipt>('finishGameCapture', { captureId: receipt.captureId });
    aborted(input.signal);
    if (completed.captureId !== receipt.captureId || !['ready', 'imported'].includes(completed.status)) throw new Error('Capture verification was not confirmed.');
    progress(1); phase('ready'); return completed;
  }

  finishCapture(captureId: string) {
    return this.withOperation(transport => transport.call<CaptureReceipt>('finishGameCapture', { captureId }));
  }

  getCapture(captureId: string) {
    return this.withOperation(transport => transport.call<CaptureReceipt>('getGameCapture', { captureId }));
  }

  discardCapture(captureId: string) {
    return this.withOperation(transport => transport.call<{ ok: boolean }>('discardGameCapture', { captureId }));
  }

  /** Use in a user-clicked link or the game's platform browser API. */
  getReviewUrl(capture: Pick<CaptureReceipt, 'captureId'>): string {
    if (!/^[a-f0-9]{48}$/.test(capture.captureId)) throw new Error('Invalid capture ID.');
    return `https://vybehub.app/game-capture/${capture.captureId}`;
  }

  getVybeUrl(): string { return 'https://vybehub.app/home'; }
}
