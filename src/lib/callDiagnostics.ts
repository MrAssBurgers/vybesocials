/**
 * In-call WebRTC / LiveKit diagnostics — dev panel + optional ?callDebug=1.
 */
import { useEffect, useState } from 'react';

export interface CallDiagnosticsSnapshot {
  connectionType: 'livekit' | 'p2p' | 'none';
  connectionState: string;
  signalingState: string;
  iceState: string;
  turnInUse: boolean;
  videoWidth: number;
  videoHeight: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  packetLossPct: number;
  latencyMs: number;
  quality: string;
  updatedAt: number;
}

const DEFAULT: CallDiagnosticsSnapshot = {
  connectionType: 'none',
  connectionState: 'new',
  signalingState: 'idle',
  iceState: 'new',
  turnInUse: false,
  videoWidth: 0,
  videoHeight: 0,
  fps: 0,
  videoBitrateKbps: 0,
  audioBitrateKbps: 0,
  packetLossPct: 0,
  latencyMs: 0,
  quality: 'unknown',
  updatedAt: 0,
};

let snapshot: CallDiagnosticsSnapshot = { ...DEFAULT };
const listeners = new Set<() => void>();

export function getCallDiagnostics(): CallDiagnosticsSnapshot {
  return snapshot;
}

export function resetCallDiagnostics(): void {
  snapshot = { ...DEFAULT };
  listeners.forEach((l) => l());
}

export function updateCallDiagnostics(partial: Partial<CallDiagnosticsSnapshot>): void {
  snapshot = {
    ...snapshot,
    ...partial,
    updatedAt: Date.now(),
  };
  listeners.forEach((l) => l());
}

export function subscribeCallDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isCallDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('callDebug') === '1';
}

export function useCallDiagnostics(): CallDiagnosticsSnapshot {
  const [state, setState] = useState(snapshot);
  useEffect(() => subscribeCallDiagnostics(() => setState({ ...snapshot })), []);
  return state;
}
