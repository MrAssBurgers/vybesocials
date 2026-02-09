/**
 * In-memory debug logger for the production debug panel.
 * Does NOT rely on console.log — stores logs in a circular buffer
 * accessible to the debug panel UI.
 */

export type DebugLogType = 'info' | 'warn' | 'error' | 'stripe' | 'network' | 'auth';

export interface DebugLogEntry {
  id: number;
  type: DebugLogType;
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface NetworkLogEntry {
  id: number;
  url: string;
  method: string;
  status: number;
  duration: number;
  timestamp: number;
  error?: string;
}

const MAX_LOGS = 100;
const MAX_NETWORK = 80;

let _logId = 0;
const _logs: DebugLogEntry[] = [];
const _networkLogs: NetworkLogEntry[] = [];
const _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

/** Add a debug log entry */
export function logEvent(type: DebugLogType, message: string, metadata?: Record<string, unknown>) {
  _logs.unshift({ id: ++_logId, type, message, metadata, timestamp: Date.now() });
  if (_logs.length > MAX_LOGS) _logs.length = MAX_LOGS;
  notify();
}

/** Add a network log entry */
export function logNetwork(entry: Omit<NetworkLogEntry, 'id'>) {
  const full: NetworkLogEntry = { ...entry, id: ++_logId };
  _networkLogs.unshift(full);
  if (_networkLogs.length > MAX_NETWORK) _networkLogs.length = MAX_NETWORK;
  // Also log errors
  if (entry.status >= 400 || entry.status === 0) {
    logEvent('network', `${entry.method} ${entry.url} → ${entry.status || 'FAIL'}${entry.error ? ': ' + entry.error : ''}`);
  }
  notify();
}

/** Read snapshots */
export function getLogs(): readonly DebugLogEntry[] {
  return _logs;
}

export function getNetworkLogs(): readonly NetworkLogEntry[] {
  return _networkLogs;
}

export function clearLogs() {
  _logs.length = 0;
  notify();
}

export function clearNetworkLogs() {
  _networkLogs.length = 0;
  notify();
}

/** Subscribe to changes — returns unsubscribe fn */
export function subscribe(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
