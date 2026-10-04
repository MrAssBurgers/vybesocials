// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../functions/src/_shared/admin', () => ({ db: {}, requireAdmin: vi.fn(), requireAuth: vi.fn() }));
import { TOKEN_CATALOG } from '../../functions/src/_shared/tokenMarketplaceAuthority';
import { MARKETPLACE_EQUIP_MAP } from './marketplaceEquip';
import { FRAME_CLASS_MAP, FRAME_COLORS, FRAME_STYLE_MAP, THEME_ACCENTS, THEME_GRADIENTS, THEME_IMAGES, THEME_PREVIEW } from './cosmeticConstants';

describe('sold permanent cosmetics fulfillment', () => {
  it.each(TOKEN_CATALOG.filter(item => item.available && item.kind === 'permanent'))('$id has an equipment target and a real profile and locker visual', item => {
    const equip = MARKETPLACE_EQUIP_MAP[item.id];
    expect(equip).toBeDefined();
    expect(equip.value).toBe(item.id);
    if (equip.type === 'frame') {
      expect(FRAME_CLASS_MAP[equip.value]).toContain('ring-');
      expect(FRAME_STYLE_MAP[equip.value].ring).toContain('ring-');
      expect(FRAME_COLORS[equip.value]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    } else {
      expect(THEME_GRADIENTS[equip.value]).toMatch(/^linear-gradient\(/);
      expect(THEME_ACCENTS[equip.value].accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(THEME_PREVIEW[equip.value].from).not.toBe(THEME_PREVIEW[equip.value].to);
      // Color effects must not resolve to a global wallpaper image or borrow a free theme.
      expect(THEME_IMAGES[equip.value]).toBeUndefined();
      const otherGradients = Object.entries(THEME_GRADIENTS).filter(([key]) => key !== equip.value).map(([, gradient]) => gradient);
      expect(otherGradients).not.toContain(THEME_GRADIENTS[equip.value]);
    }
  });
});
