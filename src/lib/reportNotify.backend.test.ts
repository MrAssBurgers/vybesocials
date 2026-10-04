// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  deliver: vi.fn(),
}));
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: {} }));
vi.mock('../../functions/src/_shared/reportNotificationDelivery.js', () => ({
  deliverReportNotification: fixture.deliver,
}));
import { onReportCreated } from '../../functions/src/reportNotify';
import type { ReportEmail, ReportEmailSender } from '../../functions/src/_shared/reportNotificationDelivery';

const event = { data: {}, params: { reportId: 'test-report' } };
const invoke = (value: unknown = event) => (onReportCreated.run as unknown as (input: unknown) => Promise<void>)(value);
const email: ReportEmail = { from: 'qa@example.test', to: ['safety@example.test'], subject: 'QA', text: 'QA', html: '<p>QA</p>' };

describe('report notification provider boundary', () => {
  beforeEach(() => {
    fixture.deliver.mockReset();
    vi.stubEnv('RESEND_API_KEY', 'local-provider-stub');
    vi.stubEnv('EMAIL_FROM', 'qa@example.test');
    fixture.deliver.mockImplementation(async (_db: unknown, _id: string, _config: unknown, send: ReportEmailSender) => {
      expect(await send(email, 'report/stable-id')).toBe('acknowledged');
      return 'accepted';
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('sends the durable provider key with the exact frozen payload and a timeout', async () => {
    const fetchStub = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'acknowledged' }) });
    vi.stubGlobal('fetch', fetchStub);
    await invoke();
    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, request] = fetchStub.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(request.method).toBe('POST');
    expect(request.headers['Idempotency-Key']).toBe('report/stable-id');
    expect(request.headers.Authorization).toBe('Bearer local-provider-stub');
    expect(request.body).toBe(JSON.stringify(email));
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects provider failure without reading or exposing its response body', async () => {
    const json = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json }));
    await expect(invoke()).rejects.toThrow('HTTP 503');
    expect(json).not.toHaveBeenCalled();
  });

  it('rejects a response that lacks provider acknowledgement', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(invoke()).rejects.toThrow('acknowledgement is missing');
  });

  it('does not call a provider when its key is missing', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    fixture.deliver.mockResolvedValue('unverified');
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    await invoke();
    expect(fixture.deliver.mock.calls[0][3]).toBeUndefined();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('ignores absent event data', async () => {
    await invoke({ params: event.params });
    expect(fixture.deliver).not.toHaveBeenCalled();
  });
});
