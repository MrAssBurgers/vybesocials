// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
const motion = scripts.filter(match => match[1].includes("getItem('xd-reduced-motion')"));
const handoff = scripts.find(match => match[1].includes("setAttribute('data-vybe-splash', 'native-handoff')"));

function bootContext(saved: string | null, initialClasses = ['dark']) {
  const classes = new Set(initialClasses);
  const attributes = new Map<string, string>();
  const getItem = vi.fn((key: string) => key === 'xd-reduced-motion' ? saved : null);
  return {
    classes, attributes, getItem,
    context: {
      localStorage: { getItem },
      document: { documentElement: {
        classList: { add: (name: string) => classes.add(name) },
        setAttribute: (name: string, value: string) => attributes.set(name, value),
      } },
      navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 17; SM-F971N; wv) AppleWebKit/537.36' },
      window: {},
    },
  };
}

describe('early loading-screen motion preference', () => {
  it('runs the exact inline preference script before native handoff and loading markup', () => {
    expect(motion).toHaveLength(1);
    expect(handoff).toBeDefined();
    expect(motion[0].index).toBeLessThan(handoff!.index!);
    expect(motion[0].index).toBeLessThan(html.indexOf('<style>'));
    expect(motion[0].index).toBeLessThan(html.indexOf('<div id="vybe-static-boot"'));
    const boot = bootContext('true');
    runInNewContext(motion[0][1], boot.context);
    expect(boot.classes.has('reduce-motion')).toBe(true);
    expect(boot.getItem).toHaveBeenCalledExactlyOnceWith('xd-reduced-motion');
    // The preference must not consume or suppress native startup detection.
    runInNewContext(handoff![1], boot.context);
    expect(boot.classes).toEqual(new Set(['dark', 'reduce-motion', 'vybe-native-shell', 'vybe-android-boot']));
    expect(boot.attributes.get('data-vybe-splash')).toBe('native-handoff');
    expect(boot.attributes.get('data-vybe-shell')).toBe('native');
  });

  it.each(['false', 'system', null, 'invalid'])('leaves normal startup unchanged for saved %s', saved => {
    const boot = bootContext(saved);
    expect(() => runInNewContext(motion[0][1], boot.context)).not.toThrow();
    expect(boot.classes).toEqual(new Set(['dark']));
  });

  it.each(['false', 'system', null])('never removes an already established reduced-motion class for %s', saved => {
    const boot = bootContext(saved, ['dark', 'reduce-motion']);
    runInNewContext(motion[0][1], boot.context);
    expect(boot.classes.has('reduce-motion')).toBe(true);
  });

  it('continues native handoff and Android fail-open setup if storage reads throw', () => {
    const boot = bootContext('true');
    boot.getItem.mockImplementation(() => { throw new Error('Storage disabled'); });
    expect(() => runInNewContext(motion[0][1], boot.context)).not.toThrow();
    runInNewContext(handoff![1], boot.context);
    expect(boot.classes.has('reduce-motion')).toBe(false);
    expect(boot.classes.has('vybe-android-boot')).toBe(true);
    expect(boot.attributes.get('data-vybe-splash')).toBe('native-handoff');
  });

  it('also tolerates a browser denying access to the localStorage property itself', () => {
    const boot = bootContext('true');
    Object.defineProperty(boot.context, 'localStorage', { get: () => { throw new Error('SecurityError'); } });
    expect(() => runInNewContext(motion[0][1], boot.context)).not.toThrow();
    expect(boot.classes).toEqual(new Set(['dark']));
  });
});
