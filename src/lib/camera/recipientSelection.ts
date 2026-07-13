/**
 * Recipient/destination selection model for the snap editor + Send To screen.
 * Pure data + reducers so chip behavior is unit-testable.
 */

export type SnapRecipientType = 'friend' | 'conversation' | 'group';

export interface SnapRecipient {
  /** Profile id for friends, conversation id for conversation/group rows. */
  id: string;
  type: SnapRecipientType;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  /** Known conversation for a friend (skips conversation creation on send). */
  conversationId?: string | null;
}

/** Story audiences with backend support today: my_story + close_friends. */
export type StoryDestinationId =
  | 'my_story'
  | 'close_friends'
  | `custom:${string}`
  | `group:${string}`;

export interface SnapSelection {
  recipients: SnapRecipient[];
  storyDestinations: StoryDestinationId[];
}

export function emptySelection(): SnapSelection {
  return { recipients: [], storyDestinations: [] };
}

function sameRecipient(a: SnapRecipient, b: SnapRecipient): boolean {
  return a.type === b.type && a.id === b.id;
}

export function hasRecipient(sel: SnapSelection, r: SnapRecipient): boolean {
  return sel.recipients.some((x) => sameRecipient(x, r));
}

export function addRecipient(sel: SnapSelection, r: SnapRecipient): SnapSelection {
  if (hasRecipient(sel, r)) return sel;
  return { ...sel, recipients: [...sel.recipients, r] };
}

export function removeRecipient(sel: SnapSelection, r: Pick<SnapRecipient, 'id' | 'type'>): SnapSelection {
  return {
    ...sel,
    recipients: sel.recipients.filter((x) => !(x.type === r.type && x.id === r.id)),
  };
}

export function toggleRecipient(sel: SnapSelection, r: SnapRecipient): SnapSelection {
  return hasRecipient(sel, r) ? removeRecipient(sel, r) : addRecipient(sel, r);
}

export function toggleStoryDestination(
  sel: SnapSelection,
  dest: StoryDestinationId,
): SnapSelection {
  const has = sel.storyDestinations.includes(dest);
  return {
    ...sel,
    storyDestinations: has
      ? sel.storyDestinations.filter((d) => d !== dest)
      : [...sel.storyDestinations, dest],
  };
}

export function clearSelection(_sel: SnapSelection): SnapSelection {
  return emptySelection();
}

export function selectionCount(sel: SnapSelection): number {
  return sel.recipients.length + sel.storyDestinations.length;
}

export function hasAnyDestination(sel: SnapSelection): boolean {
  return selectionCount(sel) > 0;
}

/**
 * Send button behavior: with a selection we send directly; with nothing
 * selected the Send button opens the full Send To screen instead.
 */
export function shouldOpenSendToScreen(sel: SnapSelection): boolean {
  return !hasAnyDestination(sel);
}

export function storyDestinationLabel(dest: StoryDestinationId): string {
  if (dest === 'my_story') return 'My Story';
  if (dest === 'close_friends') return 'Close Friends';
  if (dest.startsWith('custom:')) return 'Custom Story';
  return 'Group Story';
}

/**
 * Label for the editor's recipient/destination chip.
 * "Send to Mia", "Send to The Crew", "Send to Mia +2", "Send to My Story"…
 * Returns null when nothing is selected (chip hidden, Send opens picker).
 */
export function recipientChipLabel(sel: SnapSelection): string | null {
  const names = [
    ...sel.recipients.map((r) => r.name),
    ...sel.storyDestinations.map(storyDestinationLabel),
  ].filter(Boolean);
  if (!names.length) return null;
  if (names.length === 1) return `Send to ${names[0]}`;
  return `Send to ${names[0]} +${names.length - 1}`;
}
