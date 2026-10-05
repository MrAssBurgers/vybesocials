import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { toast } from 'sonner';
const state = vi.hoisted(() => ({ config: null as any, save: vi.fn(), nav: vi.fn(), ready: true, session: { uid: 'alice', epoch: 1 } }));
vi.mock('@/hooks/useGridLayout', () => ({ useGridLayout: () => ({ config: state.config, variant: 'mobile', saveGridLayout: state.save, preferences: { isSuccess: state.ready, isPlaceholderData: false, isError: false } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/navVisibility', () => ({ navVisibility: { setInEditMode: state.nav } }));
vi.mock('@/lib/appScrollContainer', () => ({ scrollAppTo: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { HomeEditModeProvider, EditableWidgetList, EditableWidgetWrapper, useEditMode } from './HomeEditMode';
function Widgets() {
  const { localWidgets, orderedEnabledIds } = useEditMode();
  return <EditableWidgetList>{orderedEnabledIds.map(id => <EditableWidgetWrapper key={id} widgetId={id}><button>{localWidgets.find(w => w.id === id)?.label} content</button></EditableWidgetWrapper>)}</EditableWidgetList>;
}
function Fixture() {
  const [editing, setEditing] = useState(true);
  return <><button onClick={() => setEditing(true)}>Customize</button><HomeEditModeProvider editing={editing} onEditingChange={setEditing}><Widgets /></HomeEditModeProvider></>;
}
const ids = () => [...document.querySelectorAll('[data-widget-id]')].map(node => node.getAttribute('data-widget-id'));
beforeEach(() => {
  vi.clearAllMocks(); state.ready = true; state.session = { uid: 'alice', epoch: 1 };
  state.config = { widgets: [
    { id: 'greeting', label: 'Greeting', icon: '👋', enabled: true, colSpan: 2, rowSpan: 1, order: 0 },
    { id: 'feed', label: 'Feed', icon: '📰', enabled: true, colSpan: 2, rowSpan: 1, order: 1 },
    { id: 'wallet', label: 'Wallet', icon: '💰', description: 'Your wallet', enabled: false, colSpan: 1, rowSpan: 1, order: 2 },
  ] };
  state.save.mockResolvedValue(undefined);
});
afterEach(cleanup);
async function addWallet() { fireEvent.click(screen.getByRole('button', { name: 'Add widget' })); fireEvent.click(await screen.findByRole('button', { name: 'Add Wallet' })); }
it('adds and re-adds a widget above the feed, with usable move and resize controls', async () => {
  render(<Fixture />); await addWallet(); expect(ids()).toEqual(['wallet', 'greeting', 'feed']);
  fireEvent.click(screen.getByRole('button', { name: 'Move Wallet down' }));
  expect(ids()).toEqual(['greeting', 'wallet', 'feed']);
  fireEvent.change(screen.getByRole('combobox', { name: 'Wallet width' }), { target: { value: '2' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Wallet height' }), { target: { value: '2' } });
  expect(document.querySelector('[data-widget-id="wallet"]')?.className).toContain('col-span-2');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Wallet' }));
  await addWallet(); expect(ids()[0]).toBe('wallet');
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(state.save).toHaveBeenCalled());
  const widgets = state.save.mock.calls[0][0].widgets;
  expect(widgets.find((w: any) => w.id === 'wallet')).toMatchObject({ order: 0, colSpan: 2, rowSpan: 2, enabled: true });
  expect(state.save.mock.calls[0][1]).toBe(true);
});
it('keeps unsaved edits through a preferences refresh and restores saved values after Cancel', async () => {
  const view = render(<Fixture />); await addWallet();
  state.config = { ...state.config, widgets: state.config.widgets.map((w: any) => ({ ...w })) };
  view.rerender(<Fixture />); expect(ids()[0]).toBe('wallet');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(state.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
  expect(ids()).toEqual(['greeting', 'feed']);
});
it('retains a rejected save draft, disables controls during submission, and allows retry', async () => {
  let reject!: (error: Error) => void;
  state.save.mockReturnValueOnce(new Promise((_resolve, no) => { reject = no; }));
  render(<Fixture />); await addWallet();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Wallet width' })).toBeDisabled();
  await act(async () => reject(new Error('Offline')));
  expect(ids()[0]).toBe('wallet');
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2));
});
it('does not submit defaults before the account preferences load', () => {
  state.ready = false; render(<Fixture />);
  expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Add widget' })).toBeDisabled();
});
it('cleans up a cancelled pointer drag without changing the layout', () => {
  render(<Fixture />);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag Feed' }), { pointerId: 7, button: 0, clientX: 30, clientY: 40 });
  fireEvent.pointerMove(window, { pointerId: 7, clientX: 30, clientY: 0 });
  fireEvent.pointerCancel(window, { pointerId: 7 });
  expect(ids()).toEqual(['greeting', 'feed']);
});
it('suppresses completion feedback after leaving the editor during a save', async () => {
  let finish!: () => void;
  state.save.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  const view = render(<Fixture />);
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  view.unmount();
  await act(async () => finish());
  expect(toast.success).not.toHaveBeenCalled();
});
