import { describe, expect, it } from 'vitest';
import { resolveDmThreadBackAction } from './resolveDmThreadBackAction';

describe('resolveDmThreadBackAction', () => {
  it('prioritizes media viewer over sheets and leave', () => {
    expect(
      resolveDmThreadBackAction({
        mediaViewerOpen: true,
        sheetOpen: true,
        cameraOpen: true,
        menuOpen: true,
      }),
    ).toBe('mediaViewer');
  });

  it('closes sheet before camera and leave', () => {
    expect(
      resolveDmThreadBackAction({
        sheetOpen: true,
        cameraOpen: true,
      }),
    ).toBe('sheet');
  });

  it('closes camera before menus', () => {
    expect(resolveDmThreadBackAction({ cameraOpen: true, menuOpen: true })).toBe('camera');
  });

  it('leaves when nothing is open', () => {
    expect(resolveDmThreadBackAction({})).toBe('leave');
  });
});
