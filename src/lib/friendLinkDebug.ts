/** Temporary Friend Link debug (session adb115). */

export function dbgFriendLink(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
): void {
  // #region agent log
  console.info(`[VYBE:friendlink] ${message}`, { hypothesisId, ...data });
  fetch('http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'adb115' },
    body: JSON.stringify({
      sessionId: 'adb115',
      runId: 'friendlink',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}
