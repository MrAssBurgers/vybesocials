/**
 * Static enforcement: camera entry points must use openSnapCamera with
 * launchContext — never send local blob URLs via onSend / insertDmMessage.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const configuredEntryPoints = [
  'src/components/chat/ConversationOptionsSheet.tsx',
  'src/components/social-profile/RelationshipProfileActions.tsx',
  'src/components/chat/ChatView.tsx',
  'src/features/dms/DMConversationRow.tsx',
  'src/features/dms/DMComposeButton.tsx',
  'src/components/hub/CreateMenu.tsx',
  'src/components/hub/CreateMenuLayer.tsx',
  'src/components/stories/StoryCreator.tsx',
  'src/components/create/DesktopCreateStudio.tsx',
].map((f) => resolve(ROOT, f));

const discoveredEntryPoints = walk(SRC).filter((file) => {
  const source = readFileSync(file, 'utf8');
  return /openSnapCamera|openCameraFromGesture|launchContext/.test(source);
});

const ENTRY_POINT_FILES = [...new Set([
  ...configuredEntryPoints.filter(existsSync),
  ...discoveredEntryPoints,
])];

function main() {
  for (const file of ENTRY_POINT_FILES) {
    const src = readFileSync(file, 'utf8');
    const rel = file.replace(`${ROOT}/`, '');
    if (src.includes('insertDmMessage(')) {
      throw new Error(`${rel}: camera entry must not call insertDmMessage directly`);
    }
    if (/openCameraFromGesture\s*\([^)]*,\s*['"]dm['"]/.test(src)) {
      throw new Error(`${rel}: use openSnapCamera instead of openCameraFromGesture(..., 'dm')`);
    }
    if (src.includes('onSend={(mediaUrl') || src.includes('onSend={(mediaDataUrl')) {
      throw new Error(`${rel}: must not wire onSend with local media URLs`);
    }
  }

  // Snap send service must upload before insertDmMessage
  const snapSend = readFileSync(resolve(SRC, 'lib/camera/snapSendService.ts'), 'utf8');
  assert(
    snapSend.includes('uploadSnapMedia'),
    'snapSendService must upload before callable send',
  );
  assert(
    !/insertDmMessage\([\s\S]*?media_url:\s*job\.draft\.localUri/.test(snapSend),
    'snapSendService must not send draft.localUri to insertDmMessage',
  );

  // Camera overlay: launchContext path must not short-circuit to onSend
  const unified = readFileSync(resolve(SRC, 'components/camera/UnifiedVybeCamera.tsx'), 'utf8');
  assert(unified.includes('launchContext'), 'UnifiedVybeCamera must support launchContext snap flow');

  const camera = readFileSync(resolve(SRC, 'components/camera/Camera.tsx'), 'utf8');
  assert(
    camera.includes('SnapCaptureFlow') && camera.includes('launchContext'),
    'Camera must route launchContext captures through SnapCaptureFlow',
  );

  console.log('[camera-send-enforcement] PASS (static)');
}

try {
  main();
} catch (err) {
  console.error('[camera-send-enforcement] FAIL', err.message || err);
  process.exit(1);
}
