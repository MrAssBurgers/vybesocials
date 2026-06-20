#!/usr/bin/env node
/**
 * Upload Spotify OAuth secrets to Firebase Secret Manager and redeploy Spotify functions.
 *
 * Option A — inline env (one line, no .env file):
 *   SPOTIFY_CLIENT_ID=your_id SPOTIFY_CLIENT_SECRET=your_secret npm run setup:spotify-secrets
 *
 * Option B — CLI flags:
 *   npm run setup:spotify-secrets -- --client-id=your_id --client-secret=your_secret
 *
 * Option C — `.env` file with SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
 *
 * Spotify Developer Dashboard → Redirect URIs:
 *   https://vybehub.app/spotify/callback
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';

function loadEnvFile() {
  const env = {};
  if (!existsSync('.env')) return env;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--(client-id|client-secret)=(.+)$/);
    if (m) out[m[1] === 'client-id' ? 'SPOTIFY_CLIENT_ID' : 'SPOTIFY_CLIENT_SECRET'] = m[2];
  }
  return out;
}

function runFirebase(args, input) {
  const result = spawnSync('npx', ['-y', 'firebase-tools@latest', ...args, '--project', PROJECT], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const fromArgs = parseArgs(process.argv.slice(2));
const fromFile = loadEnvFile();
const clientId =
  fromArgs.SPOTIFY_CLIENT_ID ||
  process.env.SPOTIFY_CLIENT_ID ||
  fromFile.SPOTIFY_CLIENT_ID;
const clientSecret =
  fromArgs.SPOTIFY_CLIENT_SECRET ||
  process.env.SPOTIFY_CLIENT_SECRET ||
  fromFile.SPOTIFY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(`
Missing Spotify credentials. Use any ONE of these:

  SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy npm run setup:spotify-secrets

  npm run setup:spotify-secrets -- --client-id=xxx --client-secret=yyy

  Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to .env, then run npm run setup:spotify-secrets

Get credentials: https://developer.spotify.com/dashboard
Redirect URI: https://vybehub.app/spotify/callback
`);
  process.exit(1);
}

console.log(`Setting Spotify secrets on Firebase project ${PROJECT}…`);
runFirebase(['functions:secrets:set', 'SPOTIFY_CLIENT_ID', '--force'], clientId);
runFirebase(['functions:secrets:set', 'SPOTIFY_CLIENT_SECRET', '--force'], clientSecret);

console.log('\nBuilding Cloud Functions…');
const build = spawnSync('npm', ['run', 'build'], { cwd: 'functions', stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log('\nDeploying Spotify functions…');
runFirebase(
  [
    'deploy',
    '--only',
    'functions:spotifyOauthStart,functions:spotifyOauthCallback,functions:spotifyDisconnect,functions:spotifyNowPlaying,functions:spotifyControl,functions:spotifyPlaylists,functions:spotifyListenAlong',
  ],
  undefined,
);

console.log(`
Done.

Spotify Developer Dashboard checklist:
  • Redirect URI: https://vybehub.app/spotify/callback
  • App status: Development (add your Spotify account under Users and Access)

Then Lovable Publish (client OAuth callback fix) and test:
  Settings → Connections → Connect Spotify
`);
