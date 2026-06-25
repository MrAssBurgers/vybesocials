import { db } from '@/lib/firebase';
import { getConsentState } from '@/lib/crashReportConsent';
import { getDeviceInfoText } from '@/lib/deviceInfo';

type ReportMode = 'auto' | 'manual';

interface ReportAppCrashInput {
  error: Error | string | unknown;
  componentStack?: string | null;
  mode?: ReportMode;
  source?: string;
  url?: string;
  /** Human-readable reason describing what the user was doing when it crashed */
  reason?: string;
  /** Extra debugging context (object will be JSON-stringified) */
  context?: Record<string, unknown>;
}

interface ReportAppCrashResult {
  bugReported: boolean;
  duplicate: boolean;
  errorLogged: boolean;
}

const autoReportedCrashKeys = new Set<string>();
let crashSessionId: string | null = null;

function getCrashSessionId() {
  if (!crashSessionId) {
    crashSessionId = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
  }
  return crashSessionId;
}

function toError(error: ReportAppCrashInput['error']): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : String(error));
}

function getPageUrl(explicitUrl?: string) {
  if (explicitUrl) return explicitUrl;
  if (typeof window !== 'undefined') return window.location.href;
  return 'unknown';
}

function getUserAgent() {
  if (typeof navigator !== 'undefined') return navigator.userAgent;
  return 'unknown';
}

function normalizeFingerprintPart(value?: string | null) {
  if (!value) return '';
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{10,}/g, '<TIMESTAMP>')
    .replace(/https?:\/\/[^\s]+/g, '<URL>')
    .trim()
    .slice(0, 240);
}

function createCrashFingerprint(message: string, componentStack?: string | null, url?: string) {
  return [
    normalizeFingerprintPart(message),
    normalizeFingerprintPart(componentStack),
    normalizeFingerprintPart(url),
  ].join('::');
}

async function resolveReporterProfileId(userId: string): Promise<string | null> {
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle();

  return profile?.id || null;
}

export async function reportAppCrash({
  error,
  componentStack,
  mode = 'auto',
  source = 'app_crash',
  url,
  reason,
  context,
}: ReportAppCrashInput): Promise<ReportAppCrashResult> {
  const resolvedError = toError(error);
  const pageUrl = getPageUrl(url);
  const fingerprint = createCrashFingerprint(resolvedError.message, componentStack, pageUrl);

  if (mode === 'auto' && autoReportedCrashKeys.has(fingerprint)) {
    return { bugReported: false, duplicate: true, errorLogged: false };
  }

  let userId: string | null = null;
  try {
    const { data: { user } } = await db.auth.getUser();
    userId = user?.id || null;
  } catch {
    userId = null;
  }

  const userAgent = getUserAgent();
  const deviceInfo = getDeviceInfoText();
  const contextText = context && Object.keys(context).length
    ? `--- CONTEXT ---\n${(() => { try { return JSON.stringify(context, null, 2); } catch { return String(context); } })()}\n--- /CONTEXT ---`
    : null;
  const combinedStack = [
    reason ? `Reason: ${reason}` : null,
    source ? `Source: ${source}` : null,
    deviceInfo,
    contextText,
    resolvedError.stack,
    componentStack ? `Component stack:\n${componentStack}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  let errorLogged = false;
  try {
    await db.from('error_logs').insert({
      user_id: userId,
      error_message: resolvedError.message.slice(0, 2000),
      error_stack: combinedStack.slice(0, 4000) || null,
      error_type: 'error',
      page_url: pageUrl,
      user_agent: userAgent.slice(0, 500),
      session_id: getCrashSessionId(),
    });
    errorLogged = true;
  } catch {
    // Silent fail — never let reporting trigger another crash
  }

  const hasCrashConsent = mode === 'manual' || getConsentState() !== false;
  if (!hasCrashConsent || !userId) {
    if (mode === 'auto' && errorLogged) autoReportedCrashKeys.add(fingerprint);
    return { bugReported: false, duplicate: false, errorLogged };
  }

  let bugReported = false;
  try {
    const reporterId = await resolveReporterProfileId(userId);
    if (reporterId) {
      const bugComponentStack = [
        reason ? `Reason: ${reason}` : null,
        source ? `Source: ${source}` : null,
        deviceInfo,
        contextText,
        componentStack,
      ]
        .filter(Boolean)
        .join('\n\n');

      await db.from('bug_reports').insert({
        reporter_id: reporterId,
        error_message: (reason ? `[${reason}] ` : '') + resolvedError.message.slice(0, 480),
        error_stack: resolvedError.stack?.slice(0, 2000) || null,
        component_stack: bugComponentStack.slice(0, 4000) || null,
        page_url: pageUrl,
        user_agent: userAgent.slice(0, 300),
        ai_analysis: null,
        ai_severity: 'auto',
        status: 'pending',
      });
      bugReported = true;
    }
  } catch {
    // Silent fail — error screen must stay stable
  }

  if (mode === 'auto' && (errorLogged || bugReported)) {
    autoReportedCrashKeys.add(fingerprint);
  }

  return { bugReported, duplicate: false, errorLogged };
}