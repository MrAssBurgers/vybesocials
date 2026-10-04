import { VybePartnerClient, VybePartnerError, type PartnerAuthorization, type PartnerCaptureReceipt, type PartnerClientOptions, type PartnerDeviceLink } from '../game/http.js';
import { CAPTURE_LIMIT_BYTES, type CaptureMime, type CapturePhase } from '../game/index.js';

export { VybePartnerError } from '../game/http.js';
export type { PartnerAuthorization, PartnerCaptureReceipt, PartnerDeviceLink, PartnerCapturePage, PublicFeedPage, PublicFeedPost, PublicFeedOptions } from '../game/http.js';
export type { CaptureMime, CapturePhase } from '../game/index.js';

export interface HostCapture {
  media: Blob | Uint8Array;
  contentType: CaptureMime;
  caption?: string;
  tags?: string[];
}

/** Implement in trusted host code; never forward arbitrary renderer URLs or credentials. */
export interface VybeHostAdapter {
  /** Called only by an explicit open method. Reject if the host cannot open it. */
  openExternal(url: string): void | Promise<void>;
  /** Optional engine/file-picker encoder. Must honor cancellation when possible. */
  capture?(options: { signal: AbortSignal }): Promise<HostCapture>;
  /** Register unload/extension-disable cleanup; return an unregister callback. */
  onDispose?(callback: () => void): () => void;
}

export interface VybeIntegrationOptions extends PartnerClientOptions { host: VybeHostAdapter }
export interface PreparedCapture {
  readonly idempotencyKey: string;
  readonly byteSize: number;
  readonly contentType: CaptureMime;
  /** Release the retained bytes. Does not discard a server capture. */
  dispose(): void;
}
export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  onPhase?: (phase: CapturePhase) => void;
  onCaptureReserved?: (captureId: string) => void;
}
type Draft = { connectionId: string; media: Uint8Array; caption: string; tags: string[] };
type Operation = { signal: AbortSignal; check(): void };
const MIMES: CaptureMime[] = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
const MESSAGES = {
  disposed: 'This VYBE integration has closed. Create a new instance to continue.',
  capture_unavailable: 'This host does not provide capture. Supply encoded media explicitly.',
  capture_failed: 'The host could not provide the capture. Try selecting or capturing it again.',
  open_failed: 'The host could not open VYBE. Try again from its browser control.',
  invalid_capture: 'Choose a supported image or video between 12 bytes and 48 MiB.',
  draft_unavailable: 'This capture draft was released or belongs to a different integration.',
} as const;
export class VybeIntegrationError extends Error {
  constructor(public readonly code: keyof typeof MESSAGES) { super(MESSAGES[code]); this.name = 'VybeIntegrationError'; }
}

/** Apps, games, mods and tools share the same consent-only partner protocol. */
export class VybeIntegration {
  #client: VybePartnerClient;
  #host: VybeHostAdapter;
  #closed = false;
  #operations = new Set<AbortController>();
  #drafts = new WeakMap<PreparedCapture, Draft>();
  #link: PartnerDeviceLink | null = null;
  #waitingLink: PartnerDeviceLink | null = null;
  #unsubscribe: (() => void) | undefined;

  constructor(options: VybeIntegrationOptions) {
    if (!options.host || typeof options.host.openExternal !== 'function') throw new VybePartnerError('invalid_request');
    this.#client = new VybePartnerClient(options);
    this.#host = options.host;
    const unsubscribe = options.host.onDispose?.(() => this.dispose());
    if (this.#closed) unsubscribe?.(); else this.#unsubscribe = unsubscribe;
  }

  get authorization(): PartnerAuthorization | null { return this.#closed ? null : this.#client.authorization; }

  /** No requests or windows occur on construction. Call from a Connect action. */
  beginLink(options: { signal?: AbortSignal } = {}): Promise<PartnerDeviceLink> {
    this.#assertOpen();
    this.#cancelOperations();
    this.#client.clearLocalAuthorization();
    this.#link = null;
    this.#drafts = new WeakMap();
    return this.#run(options.signal, async operation => {
      const link = await this.#client.startDeviceAuthorization({ signal: operation.signal });
      operation.check();
      this.#link = { ...link };
      return { ...link };
    });
  }

  waitForLink(options: { signal?: AbortSignal } = {}): Promise<PartnerAuthorization> {
    const link = this.#link;
    return this.#run(options.signal, async operation => {
      if (link && this.#waitingLink === link) throw new VybePartnerError('conflict');
      this.#waitingLink = link;
      try { return await this.#client.waitForAuthorization({ signal: operation.signal }); }
      finally {
        if (this.#link === link) this.#link = null;
        if (this.#waitingLink === link) this.#waitingLink = null;
      }
    });
  }

  /** Call directly from a click/key action so browser popup restrictions are respected. */
  openLink(): Promise<void> {
    this.#assertOpen();
    if (!this.#link || this.#link.expiresAt <= Date.now()) throw new VybePartnerError('expired_token');
    return this.#open(`https://vybehub.app/connect/game?code=${encodeURIComponent(this.#link.userCode)}`);
  }
  openVybe(): Promise<void> { return this.#open('https://vybehub.app/home'); }
  openReview(captureId: string): Promise<void> {
    return this.#open(this.#client.getReviewUrl({ captureId }));
  }

  /** Snapshot once. Retry this draft instead of asking the host to record again. */
  prepareCapture(input: HostCapture, options: { signal?: AbortSignal } = {}): Promise<PreparedCapture> {
    const connectionId = this.#connection();
    return this.#run(options.signal, operation => this.#prepare(input, connectionId, operation));
  }
  captureFromHost(options: { signal?: AbortSignal } = {}): Promise<PreparedCapture> {
    const connectionId = this.#connection();
    if (!this.#host.capture) throw new VybeIntegrationError('capture_unavailable');
    return this.#run(options.signal, async operation => {
      let capture: HostCapture;
      try { capture = await this.#host.capture!({ signal: operation.signal }); }
      catch { operation.check(); throw new VybeIntegrationError('capture_failed'); }
      operation.check();
      return this.#prepare(capture, connectionId, operation);
    });
  }

  stageCapture(draft: PreparedCapture, options: UploadOptions = {}): Promise<PartnerCaptureReceipt> {
    const data = this.#drafts.get(draft);
    if (!data) throw new VybeIntegrationError('draft_unavailable');
    this.#assertConnection(data.connectionId);
    return this.#run(options.signal, async operation => {
      const check = () => { operation.check(); this.#assertConnection(data.connectionId); };
      return this.#client.stageCapture({
        idempotencyKey: draft.idempotencyKey, media: data.media, contentType: draft.contentType,
        caption: data.caption, tags: data.tags, signal: operation.signal,
        onProgress: value => { check(); options.onProgress?.(value); check(); },
        onPhase: value => { check(); options.onPhase?.(value); check(); },
        onCaptureReserved: value => { check(); options.onCaptureReserved?.(value); check(); },
      });
    });
  }
  getCapture(captureId: string, options: { signal?: AbortSignal } = {}): Promise<PartnerCaptureReceipt> {
    return this.#run(options.signal, operation => this.#client.getCapture(captureId, { signal: operation.signal }));
  }
  browsePublicFeed(options: import('../game/http.js').PublicFeedOptions = {}) {
    return this.#run(options.signal, operation => this.#client.browsePublicFeed({ ...options, signal: operation.signal }));
  }
  listCaptures(options: { cursor?: string; signal?: AbortSignal } = {}) {
    return this.#run(options.signal, operation => this.#client.listCaptures({ ...options, signal: operation.signal }));
  }
  getCapturePreview(captureId: string, options: { signal?: AbortSignal } = {}): Promise<Blob> {
    return this.#run(options.signal, operation => this.#client.getCapturePreview(captureId, { signal: operation.signal }));
  }
  checkCapturePreview(captureId: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.#run(options.signal, operation => this.#client.checkCapturePreview(captureId, { signal: operation.signal }));
  }
  discardCapture(captureId: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    return this.#run(options.signal, operation => this.#client.discardCapture(captureId, { signal: operation.signal }));
  }
  revokeConnection(options: { signal?: AbortSignal } = {}): Promise<void> {
    this.#assertOpen();
    this.#cancelOperations();
    this.#link = null;
    this.#drafts = new WeakMap();
    return this.#run(options.signal, operation => this.#client.revokeConnection({ signal: operation.signal }));
  }

  /** Cancels local work and forgets credentials. Server revocation is a separate action. */
  dispose(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#cancelOperations();
    this.#client.clearLocalAuthorization();
    this.#link = null;
    this.#drafts = new WeakMap();
    const unsubscribe = this.#unsubscribe;
    this.#unsubscribe = undefined;
    unsubscribe?.();
  }

  async #prepare(input: HostCapture, connectionId: string, operation: Operation): Promise<PreparedCapture> {
    if (!input || !MIMES.includes(input.contentType)) throw new VybeIntegrationError('invalid_capture');
    const contentType = input.contentType;
    const caption = input.caption ?? '';
    if (input.tags !== undefined && !Array.isArray(input.tags)) throw new VybePartnerError('invalid_request');
    const tags = input.tags === undefined ? [] : [...input.tags];
    if (typeof caption !== 'string' || caption.length > 2200 || tags.length > 10 || tags.some(tag => typeof tag !== 'string' || tag.length > 40)) throw new VybePartnerError('invalid_request');
    const media = input.media;
    const isBytes = media instanceof Uint8Array;
    if (!isBytes && !(typeof Blob !== 'undefined' && media instanceof Blob)) throw new VybeIntegrationError('invalid_capture');
    const size = isBytes ? media.byteLength : media.size;
    if (!Number.isSafeInteger(size) || size < 12 || size > CAPTURE_LIMIT_BYTES) throw new VybeIntegrationError('invalid_capture');
    const bytes = isBytes ? new Uint8Array(media) : new Uint8Array(await media.arrayBuffer());
    operation.check();
    this.#assertConnection(connectionId);
    if (bytes.byteLength !== size) throw new VybeIntegrationError('invalid_capture');
    if (!globalThis.crypto?.randomUUID) throw new VybePartnerError('crypto_unavailable');
    const draft: PreparedCapture = Object.freeze({
      idempotencyKey: globalThis.crypto.randomUUID(), byteSize: size, contentType,
      dispose: () => { this.#drafts.delete(draft); },
    });
    this.#drafts.set(draft, { connectionId, media: bytes, caption, tags });
    return draft;
  }
  #connection(): string { this.#assertOpen(); const auth = this.#client.authorization; if (!auth) throw new VybePartnerError('invalid_token'); return auth.connectionId; }
  #assertConnection(connectionId: string): void { if (this.#connection() !== connectionId) throw new VybePartnerError('authorization_changed'); }
  #assertOpen(): void { if (this.#closed) throw new VybeIntegrationError('disposed'); }
  #cancelOperations(): void { for (const controller of this.#operations) controller.abort(); }
  #open(url: string): Promise<void> {
    return this.#run(undefined, async operation => {
      try { await this.#host.openExternal(url); }
      catch { operation.check(); throw new VybeIntegrationError('open_failed'); }
    });
  }
  async #run<T>(signal: AbortSignal | undefined, action: (operation: Operation) => Promise<T>): Promise<T> {
    this.#assertOpen();
    const controller = new AbortController();
    this.#operations.add(controller);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let active = true;
    const check = () => {
      this.#assertOpen();
      if (!active || controller.signal.aborted) throw new VybePartnerError('aborted');
    };
    let rejectAbort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(this.#closed ? new VybeIntegrationError('disposed') : new VybePartnerError('aborted'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
    });
    try {
      check();
      const result = await Promise.race([action({ signal: controller.signal, check }), cancelled]);
      check();
      return result;
    } finally {
      active = false;
      signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', rejectAbort);
      this.#operations.delete(controller);
    }
  }
}
