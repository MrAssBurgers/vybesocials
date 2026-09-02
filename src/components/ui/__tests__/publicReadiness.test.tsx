import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { syncMainLandmark } from '@/components/a11y/Accessibility';

function makeVisible(element: HTMLElement) {
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => [{
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      right: 100,
      bottom: 100,
      left: 0,
      toJSON: () => ({}),
    }],
  });
}

afterEach(() => {
  cleanup();
  document
    .querySelectorAll('[data-vybe-test-node]')
    .forEach((element) => element.remove());
});

describe('public release dialog contract', () => {
  it('uses one constrained inner scroll area and a 44px close target', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Release dialog</DialogTitle>
          <div style={{ height: 1200 }}>Long content</div>
        </DialogContent>
      </Dialog>,
    );

    const panel = document.querySelector<HTMLElement>('.vybe-dialog-panel');
    const scrollArea = document.querySelector<HTMLElement>('.vybe-dialog-scroll');
    const close = screen.getByRole('button', { name: 'Close' });

    expect(panel).toBeTruthy();
    expect(panel?.className).toContain('flex');
    expect(panel?.className).toContain('min-h-0');
    expect(scrollArea).toBeTruthy();
    expect(scrollArea?.className).toContain('flex-1');
    expect(scrollArea?.className).toContain('min-h-0');
    expect(scrollArea?.className).not.toContain('max-h-[85vh]');
    expect(close).toHaveStyle({
      width: '44px',
      height: '44px',
      minWidth: '44px',
      minHeight: '44px',
    });
  });
});

describe('shared main landmark fallback', () => {
  it('turns the route shell into a focusable main landmark when a page has none', () => {
    const routeShell = document.createElement('div');
    routeShell.dataset.routeShell = '';
    routeShell.dataset.vybeTestNode = 'true';
    makeVisible(routeShell);
    document.body.appendChild(routeShell);

    const target = syncMainLandmark();

    expect(target).toBe(routeShell);
    expect(routeShell).toHaveAttribute('id', 'main-content');
    expect(routeShell).toHaveAttribute('role', 'main');
    expect(routeShell).toHaveAttribute('tabindex', '-1');
    expect(routeShell).toHaveAttribute('data-vybe-fallback-main', 'true');
  });

  it('prefers a real page main and removes the temporary route-shell landmark', () => {
    const routeShell = document.createElement('div');
    routeShell.dataset.routeShell = '';
    routeShell.dataset.vybeTestNode = 'true';
    makeVisible(routeShell);
    document.body.appendChild(routeShell);
    syncMainLandmark();

    const pageMain = document.createElement('main');
    pageMain.dataset.vybeTestNode = 'true';
    makeVisible(pageMain);
    document.body.appendChild(pageMain);

    const target = syncMainLandmark();

    expect(target).toBe(pageMain);
    expect(pageMain).toHaveAttribute('id', 'main-content');
    expect(routeShell).not.toHaveAttribute('data-vybe-fallback-main');
    expect(routeShell).not.toHaveAttribute('role');
    expect(routeShell).not.toHaveAttribute('id');
  });
});
