import type { LayoutSettings, ThemeShareVisibility } from '@/hooks/useSharedThemes';
import type { ThemeTokens } from '@/hooks/useCustomTheme';
import { normalizeSharedTheme } from '@/lib/sharedThemeRepository';
import { themeAttempt, themeAuthorityRequest, themeActorGuard, type ThemeActor } from '@/lib/themeAuthorityClient';
import { sendThemeToUser } from '@/lib/sendShareToUser';

export interface ShareThemeInput {
  themeName: string; themeTokens: ThemeTokens; description?: string; layoutSettings?: LayoutSettings;
  tags?: string[]; category?: string; visibility?: ThemeShareVisibility; recipientProfileIds?: string[];
}
const delivered = new Map<string, Set<string>>();
function themeFromReceipt(value: unknown) {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') throw new Error('The theme was not confirmed. Please retry.');
  const theme = normalizeSharedTheme(value as Record<string, unknown>, value.id);
  if (!theme) throw new Error('This theme contains unsupported settings.');
  return theme;
}
export async function createAndDeliverTheme(actor: ThemeActor, input: ShareThemeInput, viewGuard = () => {}) {
  const accountGuard = themeActorGuard(actor);
  const guard = () => { accountGuard(); viewGuard(); };
  guard();
  const visibility = input.visibility || 'public';
  const recipients = visibility === 'friends' ? [...new Set(input.recipientProfileIds || [])].sort() : [];
  const payload = { ...input, themeName: input.themeName.trim(), visibility, recipientProfileIds: recipients };
  const attempt = await themeAttempt(actor, 'create', payload); guard();
  const result = await themeAuthorityRequest(actor, 'manage-shared-theme', { action: 'create', ...payload, requestId: attempt.requestId }); guard();
  const row = themeFromReceipt(result.theme);
  if (result.ownerUid !== actor.uid || result.profileId !== actor.profileId || result.requestId !== attempt.requestId || result.visibility !== visibility || row.creator_id !== actor.profileId
    || !Array.isArray(result.recipientProfileIds) || JSON.stringify([...result.recipientProfileIds].sort()) !== JSON.stringify(recipients)) throw new Error('The theme share was not confirmed. Please retry.');
  if (visibility === 'friends') {
    const sent = delivered.get(attempt.requestId) || new Set<string>(); delivered.set(attempt.requestId, sent);
    while (delivered.size > 64) delivered.delete(delivered.keys().next().value!);
    for (const recipientProfileId of recipients) {
      if (sent.has(recipientProfileId)) continue;
      guard();
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recipientProfileId)); guard();
      const suffix = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
      const ok = await sendThemeToUser({ recipientProfileId, senderProfileId: actor.profileId, sharedThemeId: row.id,
        clientMessageId: `theme-${attempt.requestId}-${suffix}`, accountGuard: guard });
      guard();
      if (ok) sent.add(recipientProfileId);
    }
    if (sent.size !== recipients.length) throw new Error(`Delivered to ${sent.size} of ${recipients.length} friends. Retry to finish sending.`);
    delivered.delete(attempt.requestId);
  }
  guard(); attempt.complete();
  return { row, visibility };
}

export async function changeThemeCollection(actor: ThemeActor, action: 'save' | 'unsave' | 'like' | 'unlike', themeId: string) {
  const attempt = await themeAttempt(actor, action, { themeId });
  const result = await themeAuthorityRequest(actor, 'manage-shared-theme', { action, themeId, requestId: attempt.requestId });
  if (result.action !== action || result.themeId !== themeId || result.requestId !== attempt.requestId || result.ownerUid !== actor.uid || result.profileId !== actor.profileId) throw new Error('The theme action was not confirmed. Please retry.');
  attempt.complete();
}
export async function exportThemeCode(actor: ThemeActor, themeId: string) {
  const attempt = await themeAttempt(actor, 'export', { themeId });
  const result = await themeAuthorityRequest(actor, 'generate-theme-code', { themeId, requestId: attempt.requestId });
  if (result.ownerUid !== actor.uid || result.profileId !== actor.profileId || result.themeId !== themeId || result.requestId !== attempt.requestId || typeof result.code !== 'string' || !/^[A-Z0-9]{8}$/.test(result.code)) throw new Error('The theme code was not confirmed. Please retry.');
  attempt.complete(); return result.code;
}
export async function importThemeCode(actor: ThemeActor, input: string) {
  const code = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) throw new Error('Enter the eight-character theme code.');
  const attempt = await themeAttempt(actor, 'import', { code });
  const result = await themeAuthorityRequest(actor, 'use-theme-code', { code, requestId: attempt.requestId });
  const theme = themeFromReceipt(result.theme);
  if (result.ownerUid !== actor.uid || result.profileId !== actor.profileId || result.code !== code || result.themeId !== theme.id || result.requestId !== attempt.requestId) throw new Error('The imported theme was not confirmed. Please retry.');
  attempt.complete(); return theme;
}
