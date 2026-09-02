/** Pure guards for auth-login-notify known-session handling. */
/**
 * Decide how a known install should be treated.
 *
 * Untrusted / pending-approval sessions must never short-circuit fresh sign-ins
 * (`password`, `oauth`, etc.) into `requiresApproval: false`. Only trusted
 * sessions (or resume heartbeats) may skip the approval gate.
 */
export function gateKnownSession(opts) {
    if (!opts.isResume && (opts.pendingApproval || !opts.trusted)) {
        return { action: 'require_approval' };
    }
    return { action: 'trusted_heartbeat' };
}
/** Only trusted sessions should auto-expire same-device approval prompts. */
export function shouldExpireStaleLoginChallenge(opts) {
    if (opts.resumeNoise)
        return true;
    return opts.trusted && opts.sameDevice;
}
//# sourceMappingURL=loginNotifyGuards.js.map