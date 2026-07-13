/**
 * Pure send-state machine for multi-destination snap sends.
 * preparing → uploading → processing → sending → sent | partially_sent | failed
 * (+ waiting_for_connection when offline and retrying on explicit retry).
 */

export type SnapDestinationKindKey = 'conversation' | 'story';
export type SnapDestinationState = 'pending' | 'sending' | 'sent' | 'failed';

export interface SnapDestinationStatus {
  /** Stable key: `conversation:<id>` or `story:<destinationId>` */
  key: string;
  kind: SnapDestinationKindKey;
  id: string;
  state: SnapDestinationState;
  error?: string;
}

export type SnapJobPhase =
  | 'preparing'
  | 'waiting_for_connection'
  | 'uploading'
  | 'processing'
  | 'sending'
  | 'sent'
  | 'partially_sent'
  | 'failed'
  | 'retrying';

export function destinationKey(kind: SnapDestinationKindKey, id: string): string {
  return `${kind}:${id}`;
}

export function createDestinationStatuses(input: {
  conversationIds: string[];
  storyDestinationIds: string[];
}): SnapDestinationStatus[] {
  return [
    ...input.conversationIds.map<SnapDestinationStatus>((id) => ({
      key: destinationKey('conversation', id),
      kind: 'conversation',
      id,
      state: 'pending',
    })),
    ...input.storyDestinationIds.map<SnapDestinationStatus>((id) => ({
      key: destinationKey('story', id),
      kind: 'story',
      id,
      state: 'pending',
    })),
  ];
}

export function applyDestinationState(
  destinations: SnapDestinationStatus[],
  key: string,
  state: SnapDestinationState,
  error?: string,
): SnapDestinationStatus[] {
  return destinations.map((d) =>
    d.key === key ? { ...d, state, error: state === 'failed' ? error : undefined } : d,
  );
}

export function failedDestinations(
  destinations: SnapDestinationStatus[],
): SnapDestinationStatus[] {
  return destinations.filter((d) => d.state === 'failed');
}

/** Reset only failed destinations back to pending (retry failed only). */
export function resetFailedForRetry(
  destinations: SnapDestinationStatus[],
): SnapDestinationStatus[] {
  return destinations.map((d) =>
    d.state === 'failed' ? { ...d, state: 'pending', error: undefined } : d,
  );
}

export interface PhaseInputs {
  offline?: boolean;
  uploading?: boolean;
  uploadFailed?: boolean;
  processing?: boolean;
  retrying?: boolean;
}

/** Derive the user-facing job phase from destination states + transport flags. */
export function deriveJobPhase(
  destinations: SnapDestinationStatus[],
  inputs: PhaseInputs = {},
): SnapJobPhase {
  if (inputs.offline) return 'waiting_for_connection';
  if (inputs.uploadFailed) return 'failed';
  if (inputs.uploading) return 'uploading';
  if (inputs.processing) return 'processing';

  if (!destinations.length) return 'preparing';

  const sent = destinations.filter((d) => d.state === 'sent').length;
  const failed = destinations.filter((d) => d.state === 'failed').length;
  const inFlight = destinations.some(
    (d) => d.state === 'sending' || d.state === 'pending',
  );

  if (inFlight) return inputs.retrying ? 'retrying' : 'sending';
  if (failed === 0) return 'sent';
  if (sent === 0) return 'failed';
  return 'partially_sent';
}

/** True once the job needs no more work (terminal or awaiting explicit retry). */
export function isTerminalPhase(phase: SnapJobPhase): boolean {
  return phase === 'sent' || phase === 'partially_sent' || phase === 'failed';
}

export function phaseLabel(phase: SnapJobPhase): string {
  switch (phase) {
    case 'preparing':
      return 'Preparing…';
    case 'waiting_for_connection':
      return 'Waiting for connection';
    case 'uploading':
      return 'Uploading…';
    case 'processing':
      return 'Processing…';
    case 'sending':
      return 'Sending…';
    case 'retrying':
      return 'Retrying…';
    case 'sent':
      return 'Sent';
    case 'partially_sent':
      return 'Partially sent';
    case 'failed':
      return 'Failed to send';
  }
}
