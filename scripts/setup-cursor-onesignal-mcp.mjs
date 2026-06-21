#!/usr/bin/env node
/**
 * Wire OneSignal MCP into Cursor using REST credentials from `.env`.
 *
 * Option A — Smithery browser auth (no secrets in files):
 *   1. Restart Cursor
 *   2. Settings → MCP & Integrations → Authenticate next to "onesignal"
 *   3. Enter App ID + REST API key on the Connect OneSignal page
 *
 * Option B — Header auth from `.env` (this script):
 *   ONESIGNAL_REST_API_KEY=your_key npm run setup:onesignal-mcp
 *
 * App ID defaults to VYBE Despia app `85bcf4b4-16fb-4101-90b3-59ca9574e57b`.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ONESIGNAL_URL = 'https://server.smithery.ai/onesignal/onesignal';
const DEFAULT_APP_ID = '85bcf4b4-16fb-4101-90b3-59ca9574e57b';
const PROJECT_MCP = join(process.cwd(), '.cursor', 'mcp.json');
const GLOBAL_MCP = join(homedir(), '.cursor', 'mcp.json');

function loadEnvFile() {
  const env = {};
  if (!existsSync('.env')) return env;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, data) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function mergeOnesignalMcp(config, appId, apiKey, withHeaders) {
  const next = { ...config, mcpServers: { ...(config.mcpServers || {}) } };
  const entry = { url: ONESIGNAL_URL };
  if (withHeaders && appId && apiKey) {
    entry.headers = { app_id: appId, api_key: apiKey };
  }
  next.mcpServers.onesignal = entry;
  return next;
}

const fromFile = loadEnvFile();
const appId =
  process.env.ONESIGNAL_APP_ID?.trim() ||
  fromFile.ONESIGNAL_APP_ID?.trim() ||
  DEFAULT_APP_ID;
const apiKey =
  process.env.ONESIGNAL_REST_API_KEY?.trim() ||
  fromFile.ONESIGNAL_REST_API_KEY?.trim() ||
  '';

const withHeaders = Boolean(apiKey);
if (!withHeaders) {
  console.log(`
No ONESIGNAL_REST_API_KEY found — writing URL-only MCP config.
Authenticate in Cursor: Settings → MCP & Integrations → Authenticate (onesignal).

To use header auth instead, add to .env then re-run:
  ONESIGNAL_REST_API_KEY=your_rest_key
  npm run setup:onesignal-mcp
`);
}

const projectConfig = mergeOnesignalMcp(readJson(PROJECT_MCP, { mcpServers: {} }), appId, apiKey, withHeaders);
writeJson(PROJECT_MCP, projectConfig);
console.log(`Updated ${PROJECT_MCP}`);

const globalConfig = mergeOnesignalMcp(readJson(GLOBAL_MCP, { mcpServers: {} }), appId, apiKey, withHeaders);
writeJson(GLOBAL_MCP, globalConfig);
console.log(`Updated ${GLOBAL_MCP}`);

console.log(`
Next steps:
  1. Restart Cursor (or reload MCP servers in Settings → MCP & Integrations)
  2. Confirm "onesignal" shows connected (green)
  3. Test in chat: use onesignal_health to check the connection

VYBE App ID: ${appId}
Docs: .cursor/ONESIGNAL_MCP.md
`);
