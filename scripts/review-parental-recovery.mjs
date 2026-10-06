// Trusted operator tool. No callable or client approval path is exposed.
import path from 'node:path';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
const args = {};
for (const arg of process.argv.slice(2)) {
  const at = arg.indexOf('='); if (!arg.startsWith('--') || at < 3 || Object.hasOwn(args, arg.slice(2, at))) throw new Error('Use unique --key=value arguments.');
  args[arg.slice(2, at)] = arg.slice(at + 1);
}
const keys = args.action === 'prepare' ? ['action', 'project', 'uid', 'profile-id', 'source-id', 'review-case', 'output']
  : args.action === 'apply' ? ['action', 'project', 'plan', 'reviewer-uid', 'confirmed-case'] : [];
if (!keys.length || Object.keys(args).length !== keys.length || Object.keys(args).some(key => !keys.includes(key)) || keys.some(key => !args[key])) throw new Error('Choose prepare or apply with all documented arguments.');
if (!['vybe-daaab', 'demo-vybe-parental-qa'].includes(args.project)) throw new Error('Select the exact reviewed Firebase project.');
if (args.project === 'demo-vybe-parental-qa') {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:9494' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9497') throw new Error('The demo requires the dedicated local Auth and Firestore emulators.');
} else if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Remove emulator configuration before selecting production.');
const privateRoot = path.resolve('work'); await mkdir(privateRoot, { recursive: true });
const actualRoot = await realpath(privateRoot);
async function privateFile(input, creating = false) {
  const target = path.resolve(input), location = creating ? await realpath(path.dirname(target)) : path.dirname(await realpath(target));
  const relative = path.relative(actualRoot, location);
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(target) !== '.json') throw new Error('Keep private review JSON inside the existing ignored work directory.');
  return target;
}
process.env.GCLOUD_PROJECT = args.project; process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: args.project });
const { db, auth } = await import('../functions/lib/_shared/admin.js');
if (db.projectId !== args.project || auth.app.options.projectId !== args.project) throw new Error('Firebase project mismatch.');
const { prepareParentalRecovery, applyReviewedParentalRecovery } = await import('../functions/lib/_shared/parentalRecoveryAuthority.js');
try {
  if (args.action === 'prepare') {
    const output = await privateFile(args.output, true);
    const plan = await prepareParentalRecovery(db, auth, args.uid, args['profile-id'], args['source-id'], args['review-case']);
    await writeFile(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: 'review-required', prepared: true, approved: false, writesToFirebase: false }));
  } else {
    const plan = JSON.parse(await readFile(await privateFile(args.plan), 'utf8'));
    const result = await applyReviewedParentalRecovery(db, auth, plan, args['reviewer-uid'], args['confirmed-case']);
    console.log(JSON.stringify({ ...result, bindingCompleted: true, pinReset: false }));
  }
} finally { await db.terminate(); }
