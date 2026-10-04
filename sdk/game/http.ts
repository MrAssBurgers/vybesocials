import { parsePublicFeed, type PublicFeedOptions, type PublicFeedPage } from './publicFeed.js';
export type { PublicFeedOptions, PublicFeedPage, PublicFeedPost } from './publicFeed.js';
import type { CaptureMime, CaptureReceipt, CaptureRequest } from './index.js';

export const PARTNER_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 48 * 1024 * 1024;
const VERIFY_URI = 'https://vybehub.app/connect/game';
const SCOPES = ['capture:write', 'capture:status'] as const;
const MIME_TYPES: CaptureMime[] = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
const ERROR_MESSAGES: Record<string, string> = {
  authorization_pending: 'Waiting for the player to approve in VYBE.',
  slow_down: 'VYBE requested a longer wait before checking again.',
  access_denied: 'The player declined or this connection cannot perform that action.',
  expired_token: 'The link code expired. Start linking again.',
  invalid_grant: 'This link request is no longer available. Start linking again.',
  invalid_token: 'Your connection expired or was revoked. Link VYBE again.',
  insufficient_scope: 'This connection does not have the required permission.',
  not_found: 'This capture is unavailable to this connection.',
  feed_changed: 'The feed changed. Clear this page and start browsing again.',
  conflict: 'This capture changed or the upload key was reused for different content.',
  expired_capture: 'This capture has expired.',
  payload_too_large: 'Captures must be no larger than 48 MiB.',
  invalid_request: 'VYBE could not accept this request.',
  rate_limited: 'Too many requests or a capture limit was reached. Try again later.',
  unavailable: 'VYBE is temporarily unavailable.',
  network_error: 'The request could not reach VYBE. Retry with the same capture key.',
  invalid_response: 'VYBE returned an unexpected response.',
  authorization_changed: 'The connected account changed. Start this action again.',
  aborted: 'The operation was cancelled.',
  crypto_unavailable: 'This platform needs Web Crypto SHA-256 to upload captures.',
};

/** Never includes response bodies, request URLs, credentials, or server messages. */
export class VybePartnerError extends Error {
  constructor(public readonly code: string, public readonly status = 0, public readonly retryAfter?: number) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.invalid_request);
    this.name = 'VybePartnerError';
  }
}

export interface PartnerDeviceLink {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresAt: number;
  interval: number;
}
export interface PartnerAuthorization {
  connectionId: string;
  expiresAt: number;
  scopes: readonly string[];
}
export interface PartnerClientOptions {
  clientId: string;
  /** A trusted, fixed API endpoint, e.g. https://...cloudfunctions.net/gamePartnerApi. */
  apiBaseUrl: string;
  /** Test environments only: HTTP on localhost, 127.0.0.1 or [::1]. */
  allowInsecureLoopback?: boolean;
  fetch?: typeof globalThis.fetch;
  /** Request explicit consent to read this connection's own private capture media. */
  previewCaptures?: boolean;
  /** Request separately approved public browsing; registry capability is also required. */
  browsePublicFeed?: boolean;
}
export interface PartnerCapturePage { captures: PartnerCaptureReceipt[]; nextCursor: string | null }
export type PartnerCaptureRequest = Omit<CaptureRequest, 'gameId'>;
/** Partner games never receive private Firebase storage paths or account IDs. */
export type PartnerCaptureReceipt = Omit<CaptureReceipt, 'storagePath'>;
type Session = PartnerAuthorization & { accessToken: string };
type DeviceRequest = PartnerDeviceLink & { deviceCode: string };
type RequestOptions = { signal?: AbortSignal; session?: Session; body?: unknown; chunk?: Uint8Array; checksum?: string; retry?: boolean; jsonLimit?: number; preview?: { contentType: CaptureMime; total: number; offset: number } };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new VybePartnerError('invalid_response');
  return value as Record<string, unknown>;
}
function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw new VybePartnerError('aborted'); }
function captureId(value: string) { if (!/^[a-f0-9]{48}$/.test(value)) throw new VybePartnerError('invalid_request'); return value; }

/** Gateways may return only Retry-After, or a longer delay than the JSON body. */
function responseRetryAfter(response: Response, bodyDelay?: unknown): number | undefined {
  const body = typeof bodyDelay === 'number' && Number.isFinite(bodyDelay) ? Math.max(0, bodyDelay) : 0;
  const header = response.headers.get('retry-after')?.trim();
  let seconds = 0;
  if (header && header.length <= 128) {
    if (/^\d+$/.test(header)) seconds = Number(header);
    else if (/^[A-Za-z]{3}/.test(header)) {
      const date = Date.parse(header);
      if (Number.isFinite(date)) seconds = Math.max(0, (date - Date.now()) / 1000);
    }
  }
  const delay = Math.max(body, seconds);
  return delay > 0 ? Math.min(86400, Math.ceil(delay)) : undefined;
}

function responseErrorCode(status: number): string {
  return status === 401 ? 'invalid_token' : status === 429 ? 'rate_limited' : status >= 500 ? 'unavailable' : 'invalid_response';
}

async function boundedBody(response: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new VybePartnerError('invalid_response');
  const chunks: Uint8Array[] = []; let total = 0;
  let rejectAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = () => reject(new VybePartnerError('aborted')); });
  const abort = () => { rejectAbort(); void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    checkAbort(signal);
    while (true) {
      const result = await Promise.race([reader.read(), cancelled]); checkAbort(signal);
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) throw new VybePartnerError('invalid_response');
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    signal.removeEventListener('abort', abort);
    void reader.cancel().catch(() => {});
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new VybePartnerError('aborted')); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new VybePartnerError('crypto_unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Explicitly scoped partner client. Tokens remain in memory; no Firebase SDK or credentials. */
export class VybePartnerClient {
  #base: string;
  #clientId: string;
  #fetch: typeof globalThis.fetch;
  #session: Session | null = null;
  #device: DeviceRequest | null = null;
  #linkGeneration = 0;
  #polling: DeviceRequest | null = null;
  #scopes: string[];

  constructor(options: PartnerClientOptions) {
    let base: URL;
    try { base = new URL(options.apiBaseUrl); } catch { throw new VybePartnerError('invalid_request'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (base.username || base.password || base.search || base.hash
      || (base.protocol !== 'https:' && !(options.allowInsecureLoopback === true && loopback && base.protocol === 'http:'))
      || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(options.clientId)) throw new VybePartnerError('invalid_request');
    this.#base = base.href.replace(/\/+$/, '');
    this.#clientId = options.clientId;
    this.#fetch = options.fetch || globalThis.fetch.bind(globalThis);
    if (options.previewCaptures !== undefined && typeof options.previewCaptures !== 'boolean') throw new VybePartnerError('invalid_request');
    if (options.browsePublicFeed !== undefined && typeof options.browsePublicFeed !== 'boolean') throw new VybePartnerError('invalid_request');
    this.#scopes = [...SCOPES, ...(options.previewCaptures ? ['capture:preview'] : []), ...(options.browsePublicFeed ? ['feed:read_public'] : [])];
  }

  get authorization(): PartnerAuthorization | null {
    if (!this.#session || this.#session.expiresAt <= Date.now()) { this.#session = null; return null; }
    const { connectionId, expiresAt, scopes } = this.#session;
    return { connectionId, expiresAt, scopes: [...scopes] };
  }

  /** Forget local credentials without implying server revocation. */
  clearLocalAuthorization(): void {
    ++this.#linkGeneration;
    this.#device = null;
    this.#session = null;
  }

  async startDeviceAuthorization(options: { signal?: AbortSignal } = {}): Promise<PartnerDeviceLink> {
    const generation = ++this.#linkGeneration;
    this.#device = null;
    this.#session = null;
    const data = object(await this.#request('/v1/device/code', 'POST', { body: { clientId: this.#clientId, ...(this.#scopes.length > 2 ? { scopes: [...this.#scopes] } : {}) }, signal: options.signal }));
    if (generation !== this.#linkGeneration) throw new VybePartnerError('authorization_changed');
    if (typeof data.deviceCode !== 'string' || !/^vyd_[A-Za-z0-9_-]{43}$/.test(data.deviceCode)
      || typeof data.userCode !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(data.userCode)
      || data.verificationUri !== VERIFY_URI || !Number.isInteger(data.expiresIn) || Number(data.expiresIn) <= 0 || Number(data.expiresIn) > 600
      || !Number.isInteger(data.interval) || Number(data.interval) < 5 || Number(data.interval) > 60) throw new VybePartnerError('invalid_response');
    const link: PartnerDeviceLink = {
      userCode: data.userCode,
      verificationUri: VERIFY_URI,
      // Rebuild the public link; never forward a server-provided secret-bearing URL.
      verificationUriComplete: `${VERIFY_URI}?code=${encodeURIComponent(data.userCode)}`,
      expiresAt: Date.now() + Number(data.expiresIn) * 1000,
      interval: Number(data.interval),
    };
    this.#device = { ...link, deviceCode: data.deviceCode };
    return { ...link };
  }

  async waitForAuthorization(options: { signal?: AbortSignal } = {}): Promise<PartnerAuthorization> {
    const device = this.#device;
    if (!device) throw new VybePartnerError('invalid_grant');
    if (this.#polling === device) throw new VybePartnerError('conflict');
    this.#polling = device;
    let interval = device.interval;
    try {
      while (true) {
        checkAbort(options.signal);
        if (this.#device !== device) throw new VybePartnerError('authorization_changed');
        const remaining = device.expiresAt - Date.now();
        if (remaining <= 0) throw new VybePartnerError('expired_token');
        await wait(Math.min(interval * 1000, remaining), options.signal);
        if (Date.now() >= device.expiresAt) throw new VybePartnerError('expired_token');
        if (this.#device !== device) throw new VybePartnerError('authorization_changed');
        try {
          const data = object(await this.#request('/v1/device/token', 'POST', {
            body: { clientId: this.#clientId, deviceCode: device.deviceCode }, signal: options.signal,
          }));
          if (this.#device !== device) throw new VybePartnerError('authorization_changed');
          const scopes = Array.isArray(data.scopes) ? data.scopes : [];
          if (typeof data.accessToken !== 'string' || !/^vyp_[A-Za-z0-9_-]{43}$/.test(data.accessToken) || data.tokenType !== 'Bearer'
            || typeof data.connectionId !== 'string' || !/^[a-f0-9]{32}$/.test(data.connectionId) || !Number.isInteger(data.expiresIn) || Number(data.expiresIn) <= 0 || Number(data.expiresIn) > 600
            || !Number.isSafeInteger(data.expiresAt) || Number(data.expiresAt) <= Date.now()
            || scopes.length !== this.#scopes.length || this.#scopes.some(scope => !scopes.includes(scope))) throw new VybePartnerError('invalid_response');
          this.#session = {
            accessToken: data.accessToken, connectionId: data.connectionId,
            expiresAt: Math.min(Number(data.expiresAt), Date.now() + Number(data.expiresIn) * 1000), scopes: [...this.#scopes],
          };
          this.#device = null;
          return this.authorization!;
        } catch (error) {
          if (!(error instanceof VybePartnerError)) throw error;
          if (error.code === 'authorization_pending') continue;
          if (error.code === 'slow_down') { interval = Math.max(interval + 5, error.retryAfter || 10); continue; }
          if (['rate_limited', 'network_error', 'unavailable'].includes(error.code)) { interval = Math.max(interval, error.retryAfter || 5); continue; }
          throw error;
        }
      }
    } finally {
      if (this.#device === device) this.#device = null;
      if (this.#polling === device) this.#polling = null;
    }
  }

  async authorize(options: { signal?: AbortSignal; onUserCode: (link: PartnerDeviceLink) => void }): Promise<PartnerAuthorization> {
    const link = await this.startDeviceAuthorization(options);
    options.onUserCode(link);
    return this.waitForAuthorization(options);
  }

  async stageCapture(input: PartnerCaptureRequest): Promise<PartnerCaptureReceipt> {
    const session = this.#requireSession();
    checkAbort(input.signal);
    const { contentType, idempotencyKey, caption = '', signal, onProgress, onCaptureReserved, onPhase } = input;
    if (input.tags !== undefined && !Array.isArray(input.tags)) throw new VybePartnerError('invalid_request');
    if (!(input.media instanceof Uint8Array) && (!input.media || typeof input.media.arrayBuffer !== 'function')) throw new VybePartnerError('invalid_request');
    const tags = input.tags === undefined ? [] : [...input.tags];
    const byteSize = input.media instanceof Uint8Array ? input.media.byteLength : input.media.size;
    if (!Number.isSafeInteger(byteSize) || byteSize < 12 || byteSize > MAX_CAPTURE_BYTES
      || !MIME_TYPES.includes(contentType) || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) throw new VybePartnerError('invalid_request');
    if (typeof caption !== 'string' || caption.length > 2200 || tags.length > 10 || tags.some(tag => typeof tag !== 'string' || tag.length > 40)) throw new VybePartnerError('invalid_request');
    onPhase?.('preparing'); checkAbort(signal);
    // Snapshot caller-owned bytes so hashes/retries cannot change mid-upload.
    const media = input.media instanceof Uint8Array ? new Uint8Array(input.media) : new Uint8Array(await input.media.arrayBuffer());
    if (media.byteLength !== byteSize) throw new VybePartnerError('invalid_request');
    const contentSha256 = await sha256(media);
    checkAbort(signal);
    onProgress?.(0);
    const request = { idempotencyKey, contentType, byteSize, caption, tags, contentSha256 };
    const receipt = this.#receipt(await this.#request('/v1/captures', 'POST', { session, body: request, signal, retry: true }));
    if (receipt.byteSize !== byteSize || receipt.contentType !== contentType) throw new VybePartnerError('invalid_response');
    onCaptureReserved?.(receipt.captureId); checkAbort(signal); this.#checkSession(session);
    if (receipt.status === 'ready' || receipt.status === 'imported') { onProgress?.(1); onPhase?.('ready'); return receipt; }
    if (receipt.status !== 'uploading') throw new VybePartnerError('expired_capture');
    onPhase?.('uploading');
    for (let offset = 0, index = 0; offset < byteSize; offset += PARTNER_CHUNK_BYTES, index++) {
      checkAbort(signal);
      this.#checkSession(session);
      const bytes = media.slice(offset, Math.min(offset + PARTNER_CHUNK_BYTES, byteSize));
      const checksum = await sha256(bytes);
      const acknowledgement = object(await this.#request(`/v1/captures/${receipt.captureId}/chunks/${index}`, 'PUT', { session, chunk: bytes, checksum, signal, retry: true }));
      if (acknowledgement.index !== index || acknowledgement.byteSize !== bytes.byteLength || acknowledgement.sha256 !== checksum) throw new VybePartnerError('invalid_response');
      onProgress?.((offset + bytes.byteLength) / byteSize);
    }
    onPhase?.('verifying'); checkAbort(signal); this.#checkSession(session);
    const completed = this.#receipt(await this.#request(`/v1/captures/${receipt.captureId}/finish`, 'POST', { session, body: {}, signal, retry: true }), receipt.captureId);
    if (!['ready', 'imported'].includes(completed.status) || completed.byteSize !== byteSize || completed.contentType !== contentType) throw new VybePartnerError('invalid_response');
    onPhase?.('ready');
    return completed;
  }

  async getCapture(id: string, options: { signal?: AbortSignal } = {}): Promise<PartnerCaptureReceipt> {
    return this.#receipt(await this.#request(`/v1/captures/${captureId(id)}`, 'GET', { ...options, session: this.#requireSession(), retry: true }), id);
  }

  async discardCapture(id: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    const result = object(await this.#request(`/v1/captures/${captureId(id)}`, 'DELETE', { ...options, session: this.#requireSession(), retry: true }));
    if (result.ok !== true) throw new VybePartnerError('invalid_response');
  }

  async revokeConnection(options: { signal?: AbortSignal } = {}): Promise<void> {
    const session = this.#requireSession();
    try {
      const result = object(await this.#request('/v1/connection/revoke', 'POST', { ...options, session, body: {}, retry: true }));
      if (result.ok !== true) throw new VybePartnerError('invalid_response');
    } finally {
      // Even a lost response must not leave a possibly revoked credential usable.
      if (this.#session === session) this.#session = null;
    }
  }

  /** Returns public metadata only. Never fetches media automatically; hosts clear pages on disconnect/expiry. */
  async browsePublicFeed(options: PublicFeedOptions = {}): Promise<PublicFeedPage> {
    const session = this.#requireSession();
    if (!session.scopes.includes('feed:read_public')) throw new VybePartnerError('insufficient_scope');
    if (options.contentType !== undefined && !['post', 'short', 'video'].includes(options.contentType)) throw new VybePartnerError('invalid_request');
    const query = new URLSearchParams();
    if (options.cursor !== undefined) query.set('cursor', captureId(options.cursor));
    if (options.contentType !== undefined) query.set('contentType', options.contentType);
    const data = await this.#request(`/v1/feed${query.size ? `?${query}` : ''}`, 'GET', {
      session, signal: options.signal, retry: true, jsonLimit: 8 * 1024 * 1024,
    });
    this.#checkSession(session); checkAbort(options.signal);
    try { return parsePublicFeed(data, session, options); }
    catch { throw new VybePartnerError('invalid_response'); }
  }

  async listCaptures(options: { cursor?: string; signal?: AbortSignal } = {}): Promise<PartnerCapturePage> {
    const suffix = options.cursor === undefined ? '' : `?cursor=${captureId(options.cursor)}`;
    const data = object(await this.#request(`/v1/captures${suffix}`, 'GET', { signal: options.signal, session: this.#requireSession(), retry: true }));
    if (!Array.isArray(data.captures) || data.captures.length > 20
      || (data.nextCursor !== null && (typeof data.nextCursor !== 'string' || !/^[a-f0-9]{48}$/.test(data.nextCursor)))) throw new VybePartnerError('invalid_response');
    const captures = data.captures.map(value => this.#receipt(value));
    if (captures.some((row, index) => row.captureId <= (index ? captures[index - 1].captureId : options.cursor ?? ''))
      || (typeof data.nextCursor === 'string' && (data.nextCursor <= (options.cursor ?? '') || captures.some(row => row.captureId > data.nextCursor!)))) throw new VybePartnerError('invalid_response');
    return { captures, nextCursor: data.nextCursor as string | null };
  }

  async getCapturePreview(id: string, options: { signal?: AbortSignal } = {}): Promise<Blob> {
    const session = this.#requireSession();
    if (!session.scopes.includes('capture:preview')) throw new VybePartnerError('insufficient_scope');
    const capture = await this.getCapture(id, options); this.#checkSession(session);
    if (capture.status !== 'ready') throw new VybePartnerError('not_found');
    const parts: Blob[] = []; let checksum: string | null = null;
    for (let offset = 0; offset < capture.byteSize; offset += PARTNER_CHUNK_BYTES) {
      const part = await this.#request(`/v1/captures/${captureId(id)}/preview?chunk=${offset / PARTNER_CHUNK_BYTES}`, 'GET', {
        ...options, session, preview: { contentType: capture.contentType, total: capture.byteSize, offset },
      }) as { blob: Blob; sha256: string };
      if (checksum && checksum !== part.sha256) throw new VybePartnerError('invalid_response');
      checksum = part.sha256; parts.push(part.blob);
    }
    this.#checkSession(session); checkAbort(options.signal);
    return new Blob(parts, { type: capture.contentType });
  }
  async checkCapturePreview(id: string, options: { signal?: AbortSignal } = {}): Promise<void> {
    const session = this.#requireSession();
    if (!session.scopes.includes('capture:preview')) throw new VybePartnerError('insufficient_scope');
    await this.#request(`/v1/captures/${captureId(id)}/preview`, 'HEAD', { ...options, session });
  }

  getReviewUrl(receipt: Pick<CaptureReceipt, 'captureId'>): string {
    return `https://vybehub.app/game-capture/${captureId(receipt.captureId)}`;
  }

  #requireSession(): Session {
    if (!this.#session || this.#session.expiresAt <= Date.now()) { this.#session = null; throw new VybePartnerError('invalid_token'); }
    return this.#session;
  }
  #checkSession(session: Session): void {
    if (this.#session !== session) throw new VybePartnerError('authorization_changed');
    this.#requireSession();
  }

  #receipt(value: unknown, expectedId?: string): PartnerCaptureReceipt {
    const data = object(value);
    if (typeof data.captureId !== 'string' || !/^[a-f0-9]{48}$/.test(data.captureId) || (expectedId && data.captureId !== expectedId)
      || !['uploading', 'ready', 'imported', 'cancelled', 'expired'].includes(String(data.status))
      || data.gameId !== this.#clientId || !boundedString(data.gameName, 200) || !MIME_TYPES.includes(data.contentType as CaptureMime)
      || !Number.isSafeInteger(data.byteSize) || Number(data.byteSize) < 12 || Number(data.byteSize) > MAX_CAPTURE_BYTES
      || typeof data.caption !== 'string' || data.caption.length > 2200 || !Array.isArray(data.tags) || data.tags.length > 10 || data.tags.some(tag => typeof tag !== 'string' || tag.length > 40)
      || !Number.isSafeInteger(data.expiresAt)
      || (data.postId !== null && !boundedString(data.postId, 256))) throw new VybePartnerError('invalid_response');
    return {
      captureId: data.captureId, status: data.status as CaptureReceipt['status'], gameId: data.gameId, gameName: data.gameName,
      contentType: data.contentType as CaptureMime, byteSize: Number(data.byteSize), caption: data.caption, tags: [...data.tags] as string[],
      expiresAt: Number(data.expiresAt), postId: data.postId as string | null,
      reviewUrl: this.getReviewUrl({ captureId: data.captureId }),
    };
  }

  async #request(path: string, method: string, options: RequestOptions): Promise<unknown> {
    const body = options.chunk ? new Uint8Array(options.chunk).buffer : options.body !== undefined ? JSON.stringify(options.body) : undefined;
    for (let attempt = 0; ; attempt++) {
      checkAbort(options.signal);
      if (options.session) this.#checkSession(options.session);
      const controller = new AbortController();
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 30_000);
      try {
        const response = await this.#fetch(`${this.#base}${path}`, {
          method, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
          headers: {
            ...(options.session ? { Authorization: `Bearer ${options.session.accessToken}` } : {}),
            ...(options.chunk ? { 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': options.checksum! }
              : options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          body,
        });
        checkAbort(options.signal);
        if (options.session) this.#checkSession(options.session);
        // Defend against fetch polyfills that ignore redirect:'error'.
        if (response.redirected || (response.url && response.url !== `${this.#base}${path}`)) throw new VybePartnerError('invalid_response');
        if (method === 'HEAD') {
          if (response.status === 401 && options.session === this.#session) this.#session = null;
          if (response.status !== 204) throw new VybePartnerError(response.status === 403 ? 'insufficient_scope'
            : response.status === 404 ? 'not_found' : responseErrorCode(response.status), response.status, responseRetryAfter(response));
          return undefined;
        }
        if (options.preview && response.ok) {
          const contentType = response.headers.get('content-type');
          const length = Number(response.headers.get('content-length'));
          const expected = Math.min(PARTNER_CHUNK_BYTES, options.preview.total - options.preview.offset);
          const checksum = response.headers.get('x-capture-sha256');
          if (response.status !== 200 || contentType !== options.preview.contentType || length !== expected
            || response.headers.get('content-range') !== `bytes ${options.preview.offset}-${options.preview.offset + expected - 1}/${options.preview.total}`
            || !checksum || !/^[a-f0-9]{64}$/.test(checksum)) { void response.body?.cancel().catch(() => {}); throw new VybePartnerError('invalid_response'); }
          const bytes = await boundedBody(response, length, controller.signal);
          checkAbort(options.signal); this.#checkSession(options.session!);
          if (bytes.byteLength !== length) throw new VybePartnerError('invalid_response');
          return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: contentType! }), sha256: checksum };
        }
        const text = new TextDecoder().decode(await boundedBody(response, options.jsonLimit ?? 256 * 1024, controller.signal));
        checkAbort(options.signal);
        if (options.session) this.#checkSession(options.session);
        if (response.status === 401 && options.session === this.#session) this.#session = null;
        let data: Record<string, unknown>;
        try { if (text.length > (options.jsonLimit ?? 256 * 1024)) throw new Error(); data = object(JSON.parse(text)); }
        catch { throw new VybePartnerError(responseErrorCode(response.status), response.status, responseRetryAfter(response)); }
        if (!response.ok) {
          const code = typeof data.error === 'string' && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, data.error) ? data.error
            : [401, 429].includes(response.status) || response.status >= 500 ? responseErrorCode(response.status) : 'invalid_request';
          const retryAfter = responseRetryAfter(response, data.retryAfter);
          throw new VybePartnerError(code, response.status, retryAfter);
        }
        return data;
      } catch (error) {
        checkAbort(options.signal);
        const failure = error instanceof VybePartnerError ? error : new VybePartnerError('network_error');
        if (!options.retry || attempt >= 2 || (failure.retryAfter || 0) > 60 || !['network_error', 'unavailable', 'rate_limited'].includes(failure.code)) throw failure;
        if (options.session) this.#checkSession(options.session);
        await wait(failure.retryAfter ? failure.retryAfter * 1000 : 250 * 2 ** attempt, options.signal);
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
      }
    }
  }
}
