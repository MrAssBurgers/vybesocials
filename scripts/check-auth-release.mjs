/** Read-only, unauthenticated compatibility preflight. Never sends mail or credentials. */
import assert from 'node:assert/strict';

assert.deepEqual(process.argv.slice(2), ['--project', 'vybe-daaab'],
  'Usage: node scripts/check-auth-release.mjs --project vybe-daaab');

const checks = [
  ['auth2faRequest', 401, 'UNAUTHENTICATED'],
  ['auth2faVerify', 400, 'INVALID_ARGUMENT'],
  ['authLoginNotify', 401, 'UNAUTHENTICATED'],
  ['authLoginApproval', 400, 'INVALID_ARGUMENT'],
  ['ensureAccountProfile', 401, 'UNAUTHENTICATED'],
  ['claimProfileByEmail', 401, 'UNAUTHENTICATED'],
  ['manageSignInPreferences', 401, 'UNAUTHENTICATED'],
  ['authSessionRevoke', 401, 'UNAUTHENTICATED'],
];

const results = await Promise.all(checks.map(async ([name, status, code]) => {
  try {
    const response = await fetch(`https://us-central1-vybe-daaab.cloudfunctions.net/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":{}}',
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
    const data = await response.json().catch(() => null);
    // Only fixed protocol labels are reported; no remote body, account or token is logged.
    const actualCode = typeof data?.error?.status === 'string'
      && /^[A-Z_]{1,40}$/.test(data.error.status) ? data.error.status : 'NO_CALLABLE_ERROR';
    return { name, pass: response.status === status && actualCode === code,
      result: `HTTP ${response.status} ${actualCode}`, expected: `HTTP ${status} ${code}` };
  } catch {
    return { name, pass: false, result: 'UNREACHABLE', expected: `HTTP ${status} ${code}` };
  }
}));
for (const check of results) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.result}${check.pass ? '' : `; expected ${check.expected}`}`);
console.log('Passing proves only route reachability and basic input rejection. It does not prove authenticated receipt compatibility, provider delivery, Rules, indexes or phone persistence.');
if (results.some(check => !check.pass)) process.exitCode = 1;
