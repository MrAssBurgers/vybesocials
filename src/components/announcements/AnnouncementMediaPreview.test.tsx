import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { AnnouncementMediaPreview } from './AnnouncementMediaPreview';
afterEach(cleanup);
it('renders the GIF files produced by the announcement uploader as images', () => {
  const view = render(<AnnouncementMediaPreview url="/converted.gif" mediaType="gif" />);
  expect(view.container.querySelector('img')).toHaveAttribute('src', '/converted.gif');
  expect(view.container.querySelector('video')).toBeNull();
});
it('retains muted inline video playback and native controls', () => {
  const view = render(<AnnouncementMediaPreview url="/clip.mp4" mediaType="video" />);
  const video = view.container.querySelector('video')!;
  expect(video).toHaveAttribute('controls'); expect(video).toHaveAttribute('playsinline'); expect(video.muted).toBe(true);
});
it('retains older video-backed looping animation records', () => {
  const view = render(<AnnouncementMediaPreview url="/older.mp4?token=fixture" mediaType="gif" />);
  const video = view.container.querySelector('video')!;
  expect(video).toHaveAttribute('loop'); expect(video.muted).toBe(true);
});
it('offers a media retry without hiding the announcement content', async () => {
  const user = userEvent.setup(); const view = render(<AnnouncementMediaPreview url="/image.png" mediaType="image" />);
  fireEvent.error(view.container.querySelector('img')!);
  expect(screen.getByRole('status')).toHaveTextContent(/couldn't load/i);
  await user.click(screen.getByRole('button', { name: 'Retry announcement media' }));
  expect(view.container.querySelector('img')).toBeVisible(); expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('recovers visible media when a failed URL is replaced', () => {
  const view = render(<AnnouncementMediaPreview url="/missing.png" mediaType="image" />);
  fireEvent.error(view.container.querySelector('img')!);
  view.rerender(<AnnouncementMediaPreview url="/replacement.png" mediaType="image" />);
  expect(view.container.querySelector('img')).toHaveAttribute('src', '/replacement.png');
  expect(view.container.querySelector('img')).toBeVisible();
});
