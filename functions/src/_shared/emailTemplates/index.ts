/**
 * VYBE auth email templates, ported from the Lovable Cloud React Email sources.
 * Each template is the rendered HTML with placeholder tokens you replace at send time.
 *
 * Placeholders:
 *   %LINK%        — action URL (sign-in, reset, verify, invite accept, etc.)
 *   %EMAIL%       — recipient email
 *   %NEW_EMAIL%   — only for email-change
 *   %CODE%        — only for reauthentication (6-digit code)
 *
 * Two ways to use:
 *   1) Firebase Auth Console → Authentication → Templates → paste HTML
 *      (Firebase uses %LINK%, %EMAIL%, %NEW_EMAIL%, %DISPLAY_NAME%, %APP_NAME% natively.)
 *   2) Custom sender via Cloud Functions: call renderAuthEmail() and ship via Resend/SendGrid.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type AuthTemplateName =
  | 'signup'
  | 'recovery'
  | 'magic-link'
  | 'invite'
  | 'email-change'
  | 'reauthentication';

const cache = new Map<AuthTemplateName, string>();

function load(name: AuthTemplateName): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const html = readFileSync(join(__dirname, `${name}.html`), 'utf8');
  cache.set(name, html);
  return html;
}

export interface AuthEmailVars {
  link?: string;
  email?: string;
  newEmail?: string;
  code?: string;
}

export function renderAuthEmail(name: AuthTemplateName, vars: AuthEmailVars = {}): string {
  let html = load(name);
  html = html.replaceAll('%LINK%', vars.link ?? '');
  html = html.replaceAll('%EMAIL%', vars.email ?? '');
  html = html.replaceAll('%NEW_EMAIL%', vars.newEmail ?? '');
  if (vars.code) html = html.replaceAll('%LINK%', vars.code); // reauth template uses %LINK% slot for the code
  return html;
}

export const AUTH_EMAIL_SUBJECTS: Record<AuthTemplateName, string> = {
  signup: 'Activate your VYBE account',
  recovery: 'Reset your VYBE password',
  'magic-link': 'Your VYBE login link',
  invite: "You're invited to VYBE",
  'email-change': 'Confirm your VYBE email change',
  reauthentication: 'Your VYBE verification code',
};
