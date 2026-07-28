import { describe, expect, it } from 'vitest';
import { mapNativeATTStatus } from './att';

describe('mapNativeATTStatus', () => {
  it('maps the Capacitor permission states without treating an unanswered prompt as denial', () => {
    expect(mapNativeATTStatus('prompt')).toBe('notDetermined');
    expect(mapNativeATTStatus('prompt-with-rationale')).toBe('notDetermined');
    expect(mapNativeATTStatus('granted')).toBe('authorized');
    expect(mapNativeATTStatus('denied')).toBe('denied');
    expect(mapNativeATTStatus('restricted')).toBe('restricted');
  });
});
