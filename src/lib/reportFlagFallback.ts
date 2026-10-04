import type { ReportTargetType } from '@/lib/reportModerationService';

/** True when the Cloud Function itself is not deployed. */
export function missingCloudFunction(error: { code?: string; name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = `${error.code || ''} ${error.name || ''}`.toLowerCase();
  if (/\bnot[-_ ]?found\b/.test(code) || code.includes('unimplemented')) return true;
  const message = (error.message || '').toLowerCase();
  return message.includes('not found') || message.includes('not-found') || message.includes('404') || message.includes('does not exist');
}

/**
 * The report callable is not on production yet. Store a staff-visible flag the
 * signed-in user is allowed to create. Message text is never copied here.
 */
export async function saveReportFlag(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
  reporterUid: string;
}): Promise<{ success: true; reportId: string; status: 'pending' }> {
  const { db } = await import('@/lib/firebase');
  const reportId = crypto.randomUUID();
  const flagged = [input.reason, input.details].filter((part): part is string => !!part && part.trim().length > 0).join('\n').slice(0, 500);
  const { error } = await db.from('content_flags').insert({
    id: reportId,
    reporter_id: input.reporterUid,
    content_type: input.targetType,
    content_id: input.targetId,
    flagged_text: flagged,
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { success: true, reportId, status: 'pending' };
}
