import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ preview: false }));
vi.mock('@/lib/firebase/localPreview', () => ({ isLocalPreview: () => state.preview, LOCAL_PREVIEW_PORTS: { storage: 9399 } }));
import { validPostMediaUrl } from './postMediaUrl';
beforeEach(() => { state.preview = false; });
const local = 'http://127.0.0.1:8082/v0/b/demo-vybe-preview.appspot.com/o/media%2Fphoto.webp?alt=media&token=local-fixture';
it('permits the real preview upload proxy only in isolated local QA', () => {
  expect(validPostMediaUrl(local)).toBe(false); state.preview = true;
  expect(validPostMediaUrl(local)).toBe(true);
  expect(validPostMediaUrl(local.replace(':8082', ':9399'))).toBe(true);
});
it.each([local.replace('demo-vybe-preview', 'real-bucket'), local.replace(':8082', ':8083'), local.replace('127.0.0.1', 'example.test'), local.replace('/v0/b/', '/other/'), local+'#fragment', 'https://user:password@example.test/a'])('rejects an invalid media URL %s', value => {
  state.preview = true; expect(validPostMediaUrl(value)).toBe(false);
});
