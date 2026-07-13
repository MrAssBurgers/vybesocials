import { describe, expect, it } from 'vitest';
import {
  addRecipient,
  emptySelection,
  hasAnyDestination,
  hasRecipient,
  recipientChipLabel,
  removeRecipient,
  selectionCount,
  shouldOpenSendToScreen,
  storyDestinationLabel,
  toggleRecipient,
  toggleStoryDestination,
  type SnapRecipient,
} from './recipientSelection';

const mia: SnapRecipient = {
  id: 'p-mia',
  type: 'friend',
  name: 'Mia',
  username: 'mia',
  conversationId: 'c-mia',
};
const crew: SnapRecipient = { id: 'c-crew', type: 'group', name: 'The Crew', conversationId: 'c-crew' };
const leo: SnapRecipient = { id: 'p-leo', type: 'friend', name: 'Leo' };

describe('recipient add/remove', () => {
  it('adds a recipient once (deduped by type+id)', () => {
    let sel = addRecipient(emptySelection(), mia);
    sel = addRecipient(sel, mia);
    expect(sel.recipients).toHaveLength(1);
    expect(hasRecipient(sel, mia)).toBe(true);
  });

  it('removes a recipient by type+id', () => {
    let sel = addRecipient(addRecipient(emptySelection(), mia), crew);
    sel = removeRecipient(sel, { id: mia.id, type: 'friend' });
    expect(sel.recipients.map((r) => r.id)).toEqual([crew.id]);
  });

  it('toggles recipients on and off', () => {
    let sel = toggleRecipient(emptySelection(), mia);
    expect(hasRecipient(sel, mia)).toBe(true);
    sel = toggleRecipient(sel, mia);
    expect(hasRecipient(sel, mia)).toBe(false);
  });

  it('toggles story destinations', () => {
    let sel = toggleStoryDestination(emptySelection(), 'my_story');
    expect(sel.storyDestinations).toEqual(['my_story']);
    sel = toggleStoryDestination(sel, 'close_friends');
    expect(selectionCount(sel)).toBe(2);
    sel = toggleStoryDestination(sel, 'my_story');
    expect(sel.storyDestinations).toEqual(['close_friends']);
  });
});

describe('Send button behavior', () => {
  it('opens the Send To screen only when nothing is selected', () => {
    expect(shouldOpenSendToScreen(emptySelection())).toBe(true);
    expect(shouldOpenSendToScreen(addRecipient(emptySelection(), mia))).toBe(false);
    expect(
      shouldOpenSendToScreen(toggleStoryDestination(emptySelection(), 'my_story')),
    ).toBe(false);
  });

  it('reports destination presence for both kinds', () => {
    expect(hasAnyDestination(emptySelection())).toBe(false);
    expect(hasAnyDestination(addRecipient(emptySelection(), crew))).toBe(true);
  });
});

describe('recipientChipLabel', () => {
  it('is null when empty (chip hidden)', () => {
    expect(recipientChipLabel(emptySelection())).toBeNull();
  });

  it('names a single friend or group', () => {
    expect(recipientChipLabel(addRecipient(emptySelection(), mia))).toBe('Send to Mia');
    expect(recipientChipLabel(addRecipient(emptySelection(), crew))).toBe('Send to The Crew');
  });

  it('collapses multiple destinations into +n', () => {
    let sel = addRecipient(addRecipient(emptySelection(), mia), leo);
    expect(recipientChipLabel(sel)).toBe('Send to Mia +1');
    sel = toggleStoryDestination(sel, 'my_story');
    expect(recipientChipLabel(sel)).toBe('Send to Mia +2');
  });

  it('labels story destinations', () => {
    expect(recipientChipLabel(toggleStoryDestination(emptySelection(), 'my_story'))).toBe(
      'Send to My Story',
    );
    expect(storyDestinationLabel('close_friends')).toBe('Close Friends');
    expect(storyDestinationLabel('custom:x')).toBe('Custom Story');
    expect(storyDestinationLabel('group:y')).toBe('Group Story');
  });
});
