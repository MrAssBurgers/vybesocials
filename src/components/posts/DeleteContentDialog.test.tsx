import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteContentDialog } from './DeleteContentDialog';

describe('DeleteContentDialog', () => {
  it('explains permanent deletion and confirms without a browser-native dialog', () => {
    const onConfirm = vi.fn();

    render(
      <DeleteContentDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        kind="clip"
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Delete this clip?')).toBeInTheDocument();
    expect(screen.getByText(/reactions and comments/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete clip' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('locks both choices while a delete is in progress', () => {
    render(
      <DeleteContentDialog
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isDeleting
        kind="post"
      />,
    );

    expect(screen.getByRole('button', { name: 'Keep post' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Deleting/i })).toBeDisabled();
  });
});
