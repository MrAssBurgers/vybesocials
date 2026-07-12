import { createServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const server = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const mod = await server.ssrLoadModule('/src/components/settings/ThemesSection.tsx');
  console.log('ThemesSection import OK:', Object.keys(mod));
  const tc = await server.ssrLoadModule('/src/components/settings/ThemeCustomizer.tsx');
  console.log('ThemeCustomizer import OK:', Object.keys(tc));
} catch (err) {
  console.error('IMPORT FAILED:', err?.stack || err);
  process.exit(1);
} finally {
  await server.close();
}
