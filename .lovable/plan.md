

## Replace Bug Bounty Popup with Silent Auto-Reporting + Consent

### What Changes

**Remove** the "You found a bug!" popup and XP reward system. **Replace** with a silent background reporter that automatically sends detected bugs to the admin `bug_reports` table — no user interaction needed. A one-time consent dialog asks users for permission on first login.

### Plan

**1. Create consent dialog component** (`src/components/error/CrashReportConsent.tsx`)
- Simple, friendly one-time dialog: "Help improve VYBE by automatically sending crash reports?"
- Two buttons: "Sure!" and "No thanks"
- Stores choice in `localStorage` key `vybe_crash_consent`
- Only shows once per device, only for authenticated users

**2. Rewrite `src/hooks/useBugBountyDetector.ts` → `src/hooks/useAutoBugReporter.ts`**
- Keep all the same error detection logic (JS errors, unhandled rejections, resource errors, console.error interception, fetch HTTP error interception, same IGNORED_PATTERNS)
- Remove all UI