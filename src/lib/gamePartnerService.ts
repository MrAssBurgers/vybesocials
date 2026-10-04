import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';

const scopes = z.array(z.enum(['capture:write', 'capture:status', 'capture:preview', 'feed:read_public'])).min(2).max(4)
  .refine(value => new Set(value).size === value.length && value.includes('capture:write') && value.includes('capture:status'), 'Unsupported game permissions');
const game = {
  clientId: z.string().min(1).max(200),
  gameName: z.string().min(1).max(200),
  publisherName: z.string().min(1).max(200),
  scopes,
  expiresAt: z.number().finite().positive(),
};
const linkSchema = z.object({ ...game, status: z.enum(['pending', 'approved', 'denied', 'expired', 'used']) });
const connectionSchema = z.object({
  ...game,
  connectionId: z.string().min(1).max(200),
  createdAt: z.number().finite().positive(),
  status: z.enum(['active', 'expired', 'revoked']),
});
export type GamePartnerLink = z.infer<typeof linkSchema>;
export type GamePartnerConnection = z.infer<typeof connectionSchema>;

export class GamePartnerError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'GamePartnerError'; }
}

export function normalizeGameUserCode(value: string): string {
  return value.trim().toUpperCase().replace(/-/g, '');
}

export function isGameUserCode(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(normalizeGameUserCode(value));
}

export function formatGameUserCode(value: string): string {
  const normalized = normalizeGameUserCode(value);
  return isGameUserCode(normalized) ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : value;
}

function userCodeBody(value: string) {
  if (!isGameUserCode(value)) throw new GamePartnerError('invalid-argument', 'Enter the eight-character code shown in your game.');
  return { userCode: normalizeGameUserCode(value) };
}

async function call<T>(name: string, body: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const result = await invokeFunction<unknown>(name, body);
  if (result.error) throw new GamePartnerError(result.error.code || result.error.name || 'unknown', result.error.message);
  const parsed = schema.safeParse(result.data);
  // Never silently show a subset of new or unexpected permissions in consent.
  if (!parsed.success) throw new GamePartnerError('invalid-response', 'This game connection response is not supported. Please try again later.');
  return parsed.data;
}

export function getGamePartnerLink(userCode: string): Promise<GamePartnerLink> {
  return call('getGamePartnerLink', userCodeBody(userCode), linkSchema);
}

export function approveGamePartnerLink(userCode: string, approvedScopes?: GamePartnerLink['scopes']): Promise<GamePartnerConnection> {
  return call('approveGamePartnerLink', { ...userCodeBody(userCode), ...(approvedScopes ? { approvedScopes: scopes.parse(approvedScopes) } : {}) }, connectionSchema.extend({ status: z.literal('active') }));
}

export async function denyGamePartnerLink(userCode: string): Promise<{ ok: true }> {
  await call('denyGamePartnerLink', userCodeBody(userCode), z.object({ ok: z.literal(true) }));
  return { ok: true };
}

export async function listGamePartnerConnections(): Promise<GamePartnerConnection[]> {
  const result = await call('listGamePartnerConnections', {}, z.object({ connections: z.array(connectionSchema) }));
  return result.connections;
}

export async function revokeGamePartnerConnection(connectionId: string): Promise<{ ok: true }> {
  if (!connectionId || connectionId.length > 200) throw new GamePartnerError('invalid-argument', 'This game connection is invalid.');
  await call('revokeGamePartnerConnection', { connectionId }, z.object({ ok: z.literal(true) }));
  return { ok: true };
}

export function gamePartnerErrorMessage(error: unknown): string {
  if (!(error instanceof GamePartnerError)) return 'Could not reach game connections. Please try again.';
  switch (error.code.replace(/^functions\//, '')) {
    case 'unauthenticated': return 'Please sign in again to manage your game connections.';
    case 'not-found': return 'This code or connection was not found for your account. Check the code shown in your game.';
    case 'invalid-argument': return error.message;
    case 'permission-denied': return 'This game connection is not available to your account.';
    case 'resource-exhausted': return 'Too many requests. Wait a moment before trying again.';
    case 'failed-precondition': return 'This request has expired, was already used, or is no longer available. Ask your game for a new code.';
    case 'invalid-response': return error.message;
    default: return 'Could not reach game connections. Please try again.';
  }
}
