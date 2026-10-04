// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { reportDeliveryId, reportEmail } from '../../functions/src/_shared/reportNotificationDelivery';

describe('report notification content', () => {
  const config = { from: 'VYBE <qa@example.test>', to: 'safety@example.test' };
  it('escapes every untrusted HTML value and keeps the subject independent of report text', () => {
    const hostile = '<img src=x onerror="steal()"> & \'quoted\'';
    const payload = reportEmail(hostile, { reason: hostile, details: hostile, reporter_id: hostile, target_type: hostile, target_id: hostile }, config);
    expect(payload.html).not.toContain('<img');
    expect(payload.html).toContain('&lt;img');
    expect(payload.html).toContain('&quot;');
    expect(payload.html).toContain('&#39;');
    expect(payload.subject).not.toContain(hostile);
    expect(payload.text).toContain(hostile);
    expect(payload.to).toEqual([config.to]);
  });
  it('bounds malformed legacy values and does not claim a response deadline', () => {
    const payload = reportEmail('report', { reason: { bad: true }, details: 'x'.repeat(5000), reporter_id: ['secret'], target_type: 4 }, config);
    expect(payload.html).not.toContain('[object Object]');
    expect(payload.text).not.toContain('secret');
    expect(payload.text).not.toContain('x'.repeat(2001));
    expect(payload.text).not.toContain('24 hours');
  });
  it('uses stable distinct delivery identities without exposing path characters', () => {
    expect(reportDeliveryId('same')).toBe(reportDeliveryId('same'));
    expect(reportDeliveryId('same')).not.toBe(reportDeliveryId('different'));
    expect(reportDeliveryId('slash/quote"')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('keeps private-message evidence, participant identities and quoted details out of provider payloads', () => {
    const payload = reportEmail('safe-report-id', {
      target_type: 'message', reason: 'harassment', details: 'private-quoted-content',
      reporter_id: 'private-reporter', reporter_uid: 'private-auth-id',
      target_id: 'private-message-id', target_owner_uid: 'private-sender',
      conversation_id: 'private-conversation', content: 'private-original-content',
    }, config);
    expect(JSON.stringify(payload)).not.toContain('private-');
    expect(payload.text).toContain('safe-report-id');
    expect(payload.text).toContain('harassment');
    expect(payload.html).toContain('https://vybehub.app/admin');
  });
});
