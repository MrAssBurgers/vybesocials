import { getFirebaseAuth } from '@/lib/firebase/authService';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { validateMiniApp, type MiniAppSource } from '@/features/mini-apps/model';

export type ReportTargetType = 'profile' | 'post' | 'comment' | 'mini_app';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'hate' | 'impersonation' | 'other' | 'blocked_user';
export interface ReportSubmission { targetType: ReportTargetType; targetId: string; reason: string; details?: string }
export type ReportAccountGuard = () => void;
let observedAuth: ReturnType<typeof getFirebaseAuth>;
let observedUid: string | undefined;
let epoch = 0;
let unsubscribe: (() => void) | undefined;

export function reportAccountSnapshot() {
  const auth = getFirebaseAuth();
  if (auth !== observedAuth) {
    unsubscribe?.(); observedAuth = auth; observedUid = auth?.currentUser?.uid; epoch++;
    unsubscribe = auth?.onAuthStateChanged(user => { if (observedUid !== user?.uid) { observedUid = user?.uid; epoch++; } });
  }
  if (observedUid !== auth?.currentUser?.uid) { observedUid = auth?.currentUser?.uid; epoch++; }
  return { uid: observedUid, epoch };
}
export function reportAccountGuard(expectedUid = reportAccountSnapshot().uid): ReportAccountGuard {
  const started = reportAccountSnapshot();
  return () => {
    const current = reportAccountSnapshot();
    if (!expectedUid || current.uid !== expectedUid || current.epoch !== started.epoch) {
      throw Object.assign(new Error('Your account changed. Please open this action again.'), { code: 'account-changed' });
    }
  };
}
export function isReportSessionError(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'account-changed';
}

const isRow = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const reasons = new Set<ReportReason>(['spam', 'harassment', 'inappropriate', 'hate', 'impersonation', 'other', 'blocked_user']);
function normalizeSubmission(input: ReportSubmission) {
  if (!['profile', 'post', 'comment', 'mini_app'].includes(input.targetType) || typeof input.targetId !== 'string' || !input.targetId || input.targetId.length > 200 || input.targetId.includes('/')) throw new Error('Open the content again before reporting it.');
  const suppliedReason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!suppliedReason) throw new Error('Choose a reason for your report.');
  const knownReason = reasons.has(suppliedReason as ReportReason);
  const details = [knownReason ? '' : suppliedReason, input.details?.trim() || ''].filter(Boolean).join('\n').slice(0, 1000);
  return { targetType: input.targetType, targetId: input.targetId, reason: knownReason ? suppliedReason as ReportReason : 'other' as const, ...(details ? { details } : {}) };
}

const ATTEMPT_STORAGE = 'vybe-report-attempts-v1';
const attempts = new Map<string, string>();
const MAX_ATTEMPTS = 64;
function storedAttempts(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(ATTEMPT_STORAGE) || '{}');
    if (!isRow(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, id]) => /^[a-f0-9]{64}$/.test(key) && typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)).slice(-MAX_ATTEMPTS)) as Record<string, string>;
  } catch { return {}; }
}
function persistAttempt(key: string, requestId?: string) {
  try {
    const stored = storedAttempts();
    if (requestId) stored[key] = requestId; else delete stored[key];
    sessionStorage.setItem(ATTEMPT_STORAGE, JSON.stringify(Object.fromEntries(Object.entries(stored).slice(-MAX_ATTEMPTS))));
  } catch { /* Storage restrictions retain in-memory retry protection. */ }
}
async function attemptFor(input: Record<string, unknown>, guard: ReportAccountGuard) {
  guard();
  const serialized = JSON.stringify([reportAccountSnapshot().uid, input]);
  // Only a digest and random receipt ID are persisted, never report text or IDs.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  guard();
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const requestId = attempts.get(key) || storedAttempts()[key] || crypto.randomUUID();
  attempts.set(key, requestId); persistAttempt(key, requestId);
  while (attempts.size > MAX_ATTEMPTS) attempts.delete(attempts.keys().next().value!);
  return { requestId, complete: () => { if (attempts.get(key) === requestId) attempts.delete(key); if (storedAttempts()[key] === requestId) persistAttempt(key); } };
}

export async function reportModerationRequest<T>(request: Record<string, unknown>, guard = reportAccountGuard()): Promise<T> {
  guard();
  const result = await invokeFunction<unknown>('report-moderation', request);
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Reporting is unavailable. Please try again.'), { code: result.error.code || result.error.name });
  if (!isRow(result.data) || (!['list', 'count', 'inspect'].includes(String(request.action)) && result.data.success !== true)) throw new Error('The report action was not confirmed. Please try again.');
  return result.data as T;
}

export async function submitSafetyReport(input: ReportSubmission, guard = reportAccountGuard()) {
  guard();
  const request = { action: 'submit', ...normalizeSubmission(input) };
  const attempt = await attemptFor(request, guard);
  const result = await reportModerationRequest<{ success: true; reportId: string; status: string }>({ ...request, requestId: attempt.requestId }, guard);
  if (typeof result.reportId !== 'string' || !result.reportId || result.reportId.length > 200 || result.reportId.includes('/') || result.status !== 'pending') throw new Error('Your report was not confirmed. Please try again.');
  guard(); attempt.complete();
  return result;
}

export async function performReportAction<T>(request: Record<string, unknown>, guard = reportAccountGuard()): Promise<T> {
  const attempt = await attemptFor(request, guard);
  const result = await reportModerationRequest<T>({ ...request, requestId: attempt.requestId }, guard);
  if (!isRow(result) || (request.reportId && result.reportId !== request.reportId)
    || (request.action === 'review' && result.status !== request.status)
    || (request.action === 'removeMiniApp' && (result.status !== 'actioned' || result.holdActive !== true || typeof result.appId !== 'string'))
    || (request.action === 'releaseMiniApp' && (result.appId !== request.appId || result.holdActive !== false))) throw new Error('The moderation action was not confirmed. Refresh and try again.');
  guard(); attempt.complete();
  return result;
}

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'actioned' | 'unknown';
export interface ReportSummary {
  id: string; verification: 'verified' | 'legacy'; targetType: ReportTargetType | null; targetId: string | null;
  reporterId: string | null; reporterUid: string | null; targetOwnerUid: string | null;
  reason: string; details: string; status: ReportStatus; createdAt: string | null;
  reviewedAt: string | null; reviewedBy: string | null; adminNotes: string;
}
export interface ReportPage { reports: ReportSummary[]; nextCursor: string | null }
export interface ReportInspection {
  report: ReportSummary;
  target: { type: ReportTargetType | null; id: string | null; ownerUid: string | null; available: boolean; title: string; caption: string | null; revision: string | null; source?: MiniAppSource };
  hold: { active: boolean; revision: string | null; note: string; removedAt: string | null; releasedAt: string | null } | null;
}
const text = (value: unknown, limit = 1000) => typeof value === 'string' ? value.slice(0, limit) : '';
const id = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') ? value : null;
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
function normalizedReport(value: unknown): ReportSummary {
  if (!isRow(value) || !id(value.id)) throw new Error('A report could not be read. Please refresh the list.');
  return {
    id: id(value.id)!, verification: value.verification === 'verified' ? 'verified' : 'legacy',
    targetType: ['profile', 'post', 'comment', 'mini_app'].includes(String(value.targetType)) ? value.targetType as ReportTargetType : null,
    targetId: id(value.targetId), reporterId: id(value.reporterId), reporterUid: id(value.reporterUid), targetOwnerUid: id(value.targetOwnerUid),
    reason: text(value.reason) || 'Reason unavailable', details: text(value.details),
    status: ['pending', 'reviewed', 'dismissed', 'actioned'].includes(String(value.status)) ? value.status as ReportStatus : 'unknown',
    createdAt: date(value.createdAt), reviewedAt: date(value.reviewedAt), reviewedBy: id(value.reviewedBy), adminNotes: text(value.adminNotes),
  };
}
export async function getReportPage(input: { cursor?: string; status?: Exclude<ReportStatus, 'unknown'> } = {}, guard = reportAccountGuard()): Promise<ReportPage> {
  const data = await reportModerationRequest<Record<string, unknown>>({ action: 'list', limit: 25, ...input }, guard);
  if (!Array.isArray(data.reports) || data.reports.length > 50 || !(data.nextCursor === null || id(data.nextCursor))) throw new Error('The report list could not be verified. Please try again.');
  return { reports: data.reports.map(normalizedReport), nextCursor: data.nextCursor as string | null };
}
export async function getPendingReportCount(guard = reportAccountGuard()): Promise<number> {
  const data = await reportModerationRequest<Record<string, unknown>>({ action: 'count' }, guard);
  if (!Number.isSafeInteger(data.pendingCount) || Number(data.pendingCount) < 0 || data.includesLegacy !== true) throw new Error('The report count is unavailable.');
  return data.pendingCount as number;
}
export async function inspectSafetyReport(reportId: string, guard = reportAccountGuard()): Promise<ReportInspection> {
  const data = await reportModerationRequest<Record<string, unknown>>({ action: 'inspect', reportId }, guard);
  const report = normalizedReport(data.report);
  if (report.id !== reportId || !isRow(data.target) || typeof data.target.available !== 'boolean') throw new Error('This report could not be inspected. Please refresh.');
  const target = data.target;
  const targetType = ['profile', 'post', 'comment', 'mini_app'].includes(String(target.type)) ? target.type as ReportTargetType : null;
  const targetId = id(target.id);
  if (targetType !== report.targetType || targetId !== report.targetId) throw new Error('The report target changed. Please refresh.');
  const hold = isRow(data.hold) ? { active: data.hold.active === true, revision: typeof data.hold.revision === 'string' && /^[a-f0-9]{64}$/.test(data.hold.revision) ? data.hold.revision : null, note: text(data.hold.note), removedAt: date(data.hold.removedAt), releasedAt: date(data.hold.releasedAt) } : null;
  return { report, target: { type: targetType, id: targetId, ownerUid: id(target.ownerUid), available: target.available === true, title: text(target.title, 200), caption: typeof target.caption === 'string' ? text(target.caption, 8000) : null, revision: id(target.revision), ...(target.available && targetType === 'mini_app' && target.source ? { source: validateMiniApp(target.source) } : {}) }, hold };
}
