import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImgHTMLAttributes } from 'react';
const signing = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: signing }));
vi.mock('@/components/ui/avatar', () => ({ AvatarImage: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} /> }));
import { CommunityAvatarImage } from './CommunityAvatarImage';
afterEach(() => { cleanup(); signing.mockReset(); });

describe('community storage icons', () => {
  it('renders the resolved URL instead of a gs storage reference', () => {
    signing.mockReturnValue('https://firebasestorage.googleapis.com/download');
    render(<CommunityAvatarImage src="gs://demo-vybe-creators.appspot.com/media/owner/icon.png" alt="Community" />);
    expect(signing).toHaveBeenCalledWith('gs://demo-vybe-creators.appspot.com/media/owner/icon.png');
    expect(screen.getByAltText('Community')).toHaveAttribute('src', 'https://firebasestorage.googleapis.com/download');
  });
  it('does not send a raw storage URL to the browser while resolution is pending', () => {
    signing.mockReturnValue(null);
    render(<CommunityAvatarImage src="gs://demo-vybe-creators.appspot.com/media/owner/icon.png" alt="Community" />);
    expect(screen.getByAltText('Community')).not.toHaveAttribute('src');
  });
  it('updates after a new upload is selected', () => {
    signing.mockImplementation(url => url === 'gs://bucket/new' ? 'https://example.test/new' : 'https://example.test/old');
    const { rerender } = render(<CommunityAvatarImage src="gs://bucket/old" alt="Community" />);
    rerender(<CommunityAvatarImage src="gs://bucket/new" alt="Community" />);
    expect(screen.getByAltText('Community')).toHaveAttribute('src', 'https://example.test/new');
  });
});
