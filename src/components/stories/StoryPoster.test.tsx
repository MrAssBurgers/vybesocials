import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryPoster } from './StoryPoster';
afterEach(cleanup);
describe('story poster media lifecycle', () => {
  it('keeps a gradient fallback until decoding, then reveals valid media', () => {
    const view = render(<StoryPoster hasStory hasUnviewed={false} posterUrl="/story.jpg" fallbackInitial="Alice" />);
    const image = view.container.querySelector('img')!;
    expect(image.style.opacity).toBe('0');
    expect(view.container.textContent).toContain('A');
    Object.defineProperty(image, 'naturalWidth', { value: 640 }); fireEvent.load(image);
    expect(image.style.opacity).toBe('1');
    expect(view.container.querySelector('[data-poster-state="loaded"]')).not.toBeNull();
  });
  it('recovers from failed media and retries when the selected poster changes', () => {
    const view = render(<StoryPoster hasStory hasUnviewed={false} posterUrl="/missing.jpg" fallbackInitial="Alice" />);
    fireEvent.error(view.container.querySelector('img')!);
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.querySelector('[data-poster-state="failed"]')).not.toBeNull();
    view.rerender(<StoryPoster hasStory hasUnviewed={false} posterUrl="/replacement.jpg" fallbackInitial="Bob" />);
    expect(view.container.querySelector('img')?.getAttribute('src')).toBe('/replacement.jpg');
    expect(view.container.querySelector('[data-poster-state="loading"]')).not.toBeNull();
    expect(view.container.textContent).toContain('B');
  });
  it('does not expose unviewed posters while loading or after failure', () => {
    const view = render(<StoryPoster hasStory hasUnviewed posterUrl="/private-preview.jpg" fallbackInitial="Alice" />);
    const image = view.container.querySelector('img')!;
    Object.defineProperty(image, 'naturalWidth', { value: 640 }); fireEvent.load(image);
    expect(image.style.opacity).toBe('0.2');
    expect(view.container.querySelector('.z-10')).not.toBeNull();
    fireEvent.error(image); expect(view.container.querySelector('.z-10')).not.toBeNull();
    expect(view.container.querySelector('[data-poster-state="failed"]')).not.toBeNull();
  });
});
