import assert from 'node:assert/strict';
import { mkdir, writeFile, lstat, symlink, copyFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const root = path.join(repo, 'work', 'local-preview');
const source = path.join(root, 'functions');
await mkdir(source, { recursive: true });
const dependencyLink = path.join(source, 'node_modules');
const dependencies = path.join(repo, 'functions', 'node_modules');
const existing = await lstat(dependencyLink).catch(() => null);
if (!existing) await symlink(dependencies, dependencyLink, process.platform === 'win32' ? 'junction' : 'dir');
else assert.ok(existing.isSymbolicLink(), 'QA dependencies must remain an explicit link; do not replace files');
const moduleUrl = name => pathToFileURL(path.join(repo, 'functions', 'lib', name)).href;
// Deliberately exclude auth, email, push, billing, AI and scheduled/background exports.
// This is a local runtime of the actual domain callables, not a mock success server.
const entry = `
import './guard.mjs';
import { onCall } from 'firebase-functions/v2/https';
import { premiumStatusForRequest } from ${JSON.stringify(moduleUrl('_shared/premiumAuthority.js'))};
export const checkPremiumSubscription = onCall(premiumStatusForRequest);
export { tokenMarketplace } from ${JSON.stringify(moduleUrl('tokenMarketplace.js'))};
export { reportModeration } from ${JSON.stringify(moduleUrl('reportModeration.js'))};
export { sendDmMessage } from ${JSON.stringify(moduleUrl('dmSend.js'))};
export { publishStory, listVisibleStories, manageCloseFriends } from ${JSON.stringify(moduleUrl('storyPublish.js'))};
export { premiumGiftManage } from ${JSON.stringify(moduleUrl('premiumGifts.js'))};
export { createGameCapture, getGameCapture, finishGameCapture, completeGameCapture, discardGameCapture } from ${JSON.stringify(moduleUrl('gameIntegration.js'))};
export { getGamePartnerLink, approveGamePartnerLink, denyGamePartnerLink, listGamePartnerConnections, revokeGamePartnerConnection } from ${JSON.stringify(moduleUrl('gamePartnerAuth.js'))};
export { incrementChallengeProgress, syncMyChallengeProgress, claimChallengeReward } from ${JSON.stringify(moduleUrl('challengeProgress.js'))};
export { communityCreate, communityJoin, communityInvite, communityManage, communitySendMessage } from ${JSON.stringify(moduleUrl('community.js'))};
`;
await writeFile(path.join(source, 'guard.mjs'), "if (process.env.GCLOUD_PROJECT !== 'demo-vybe-preview' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8280' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9199' || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9399') throw new Error('Local preview requires all demo emulators');\n");
await writeFile(path.join(source, 'index.mjs'), entry);
await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'vybe-local-preview-only', private: true, type: 'module', main: 'index.mjs', engines: { node: '20' }, dependencies: { 'firebase-admin': '^13.0.0', 'firebase-functions': '^6.3.0' } }, null, 2));
for (const name of ['firestore.rules', 'firestore.indexes.json', 'storage.rules']) await copyFile(path.join(repo, name), path.join(root, name));
await writeFile(path.join(root, 'firebase.json'), JSON.stringify({
  firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
  storage: { rules: 'storage.rules' },
  functions: [{ source: 'functions', codebase: 'local-preview' }],
  emulators: {
    auth: { host: '127.0.0.1', port: 9199 }, firestore: { host: '127.0.0.1', port: 8280 },
    storage: { host: '127.0.0.1', port: 9399 }, functions: { host: '127.0.0.1', port: 5101 },
    hub: { host: '127.0.0.1', port: 4500 }, logging: { host: '127.0.0.1', port: 4600 },
    ui: { enabled: false }, singleProjectMode: true,
  },
}, null, 2));
console.log('Prepared work/local-preview/firebase.json. Use --project demo-vybe-preview; never deploy this configuration.');
