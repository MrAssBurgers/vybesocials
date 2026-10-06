import { reportAccountGuard, reportModerationRequest } from './reportModerationService';

export async function getPendingModerationCount(guard = reportAccountGuard()): Promise<number> {
  const data = await reportModerationRequest<Record<string, unknown>>({ action: 'moderationCount' }, guard);
  if (!Number.isSafeInteger(data.pendingCount) || Number(data.pendingCount) < 0 || data.includesLegacy !== true) throw new Error('The moderation count is unavailable.');
  return data.pendingCount as number;
}

const isRow = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') ? value : null;
const text = (value: unknown) => typeof value === 'string' ? value.slice(0, 1000) : '';
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
export async function getPostDeletionHistory(guard = reportAccountGuard()) {
  const data = await reportModerationRequest<Record<string, unknown>>({ action: 'deletionHistory' }, guard);
  if (!Array.isArray(data.entries) || data.entries.length > 100 || data.entries.some(row => !isRow(row) || !id(row.id))) throw new Error('Deletion history could not be verified.');
  return data.entries.map(row => ({ id: id(row.id)!, caption: text(row.caption), reason: text(row.reason), created_at: date(row.created_at) }));
}
