import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mapPinFixture } from '@/test/mapPinFixture';
import { createMapContentMarker } from './mapContentMarker';

describe('shared content map buttons', () => {
  it('uses a native labelled button and always activates the latest checked row', () => {
    const initial = mapPinFixture(), click = vi.fn(), nextClick = vi.fn();
    const control = createMapContentMarker(initial, click), button = control.element.querySelector('button')!;
    expect(button.type).toBe('button'); expect(button.getAttribute('aria-label')).toContain('Open post by Alice · Chicago');
    fireEvent.click(button); expect(click).toHaveBeenLastCalledWith(initial);
    const next = mapPinFixture({ areaLabel: 'Seattle', revision: 'd'.repeat(48) }); control.update(next, nextClick);
    fireEvent.click(button); expect(nextClick).toHaveBeenLastCalledWith(next); expect(click).toHaveBeenCalledOnce();
    control.dispose(); fireEvent.click(button); expect(nextClick).toHaveBeenCalledOnce(); expect(button.disabled).toBe(true);
  });
  it('keeps names as text and recovers an image failure without losing the accessible target', () => {
    const control = createMapContentMarker(mapPinFixture({ areaLabel: '<img onerror="bad()">', thumbnailUrl: 'https://example.test/image.jpg' }), vi.fn());
    const image = control.element.querySelector('img')!; expect(control.element.querySelectorAll('img')).toHaveLength(1);
    fireEvent.error(image); expect(image.hidden).toBe(true); expect(control.element.querySelector('button')?.getAttribute('aria-label')).toContain('<img');
    control.update(mapPinFixture({ thumbnailUrl: 'https://example.test/next.jpg' }), vi.fn()); expect(image.hidden).toBe(false);
    control.update(mapPinFixture(), vi.fn()); expect(image.hasAttribute('src')).toBe(false); expect(image.hidden).toBe(true);
  });
});
