// Read-only review input. Never creates approval or edits accounts/profiles.
import { prepareAccountProfileRecovery } from '../functions/lib/_shared/accountProfileAuthority.js';
import { db, auth } from '../functions/lib/_shared/admin.js';
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const at = arg.indexOf('='); if (!arg.startsWith('--') || at < 3) throw new Error('Use --uid=… --profile-id=… --review-case=…');
  return [arg.slice(2, at), arg.slice(at + 1)];
}));
if (Object.keys(args).some(key => !['uid', 'profile-id', 'review-case'].includes(key))) throw new Error('This tool is read-only; there is no apply/approve option.');
try {
  const plan = await prepareAccountProfileRecovery(db, auth, args.uid, args['profile-id'], args['review-case']);
  console.log(JSON.stringify({ warning: 'NOT APPROVED. Independently verify historical ownership. Public profile/email/index fields are not migration evidence.', plan }, null, 2));
} finally { await db.terminate(); }
