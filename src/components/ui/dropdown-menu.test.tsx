import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from './dropdown-menu';

const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
});
afterEach(() => {
  cleanup();
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

function Menu({ onSelect = () => {} }: { onSelect?: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Options</DropdownMenuTrigger>
      <DropdownMenuContent aria-label="Options menu">
        <DropdownMenuItem onSelect={onSelect}>First action</DropdownMenuItem>
        <DropdownMenuItem disabled>Unavailable</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>More options</DropdownMenuSubTrigger>
          <DropdownMenuSubContent aria-label="More options menu">
            <DropdownMenuItem>Nested action</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked} onSelect={event => event.preventDefault()}>
          Show details
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem>Last action</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

async function openWithKeyboard() {
  const trigger = screen.getByRole('button', { name: 'Options' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  await waitFor(() => expect(screen.getByRole('menuitem', { name: 'First action' })).toHaveFocus());
  return trigger;
}

describe('shared dropdown interactions', () => {
  it('keeps long menus scrollable while keyboard movement skips unavailable actions', async () => {
    render(<Menu />);
    await openWithKeyboard();
    const menu = screen.getByRole('menu', { name: 'Options' });
    expect(menu).toHaveClass('vybe-menu-content', 'overflow-y-auto', 'overscroll-contain');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'More options' })).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Last action' })).toHaveFocus());
  });

  it('activates keyboard selection once and returns focus to its trigger', async () => {
    const onSelect = vi.fn();
    render(<Menu onSelect={onSelect} />);
    const trigger = await openWithKeyboard();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('supports checkbox selection and Escape without losing focus', async () => {
    render(<Menu />);
    const trigger = await openWithKeyboard();
    const checkbox = screen.getByRole('menuitemcheckbox', { name: 'Show details' });
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: ' ' });
    await waitFor(() => expect(checkbox).toHaveAttribute('aria-checked', 'true'));
    fireEvent.keyDown(checkbox, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('portals submenus outside the scrolling parent and preserves arrow-key navigation', async () => {
    render(<Menu />);
    await openWithKeyboard();
    const subTrigger = screen.getByRole('menuitem', { name: 'More options' });
    subTrigger.focus();
    fireEvent.keyDown(subTrigger, { key: 'ArrowRight' });
    const nested = await screen.findByRole('menuitem', { name: 'Nested action' });
    await waitFor(() => expect(nested).toHaveFocus());
    const parent = screen.getByRole('menu', { name: 'Options' });
    const submenu = screen.getByRole('menu', { name: 'More options' });
    expect(parent.contains(submenu)).toBe(false);
    expect(submenu).toHaveClass('vybe-menu-content', 'overflow-y-auto');
    fireEvent.keyDown(nested, { key: 'ArrowLeft' });
    await waitFor(() => expect(subTrigger).toHaveFocus());
  });
});
