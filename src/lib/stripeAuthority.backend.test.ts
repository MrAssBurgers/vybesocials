// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import https from 'node:https';
import http from 'node:http';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ rows: new Map<string, Row>(), queryError: null as Error | null, stripe: {} as Record<string, any> }));
vi.mock('../../functions/src/_shared/admin.js', () => {
  const ref = (path: string) => ({ get: async () => snapshot(path), set: vi.fn(async (row: Row) => { state.rows.set(path, { ...state.rows.get(path), ...row }); }) });
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: state.rows.has(path), data: () => state.rows.get(path), ref: ref(path) });
  const query = (name: string, filters: Array<[string, unknown]> = [], limit = Infinity) => ({
    where: (field: string, _op: string, value: unknown) => query(name, [...filters, [field, value]], limit),
    limit: (value: number) => query(name, filters, value),
    get: async () => {
      if (state.queryError) throw state.queryError;
      const docs = [...state.rows].filter(([path, row]) => path.startsWith(`${name}/`) && filters.every(([key, value]) => row[key] === value)).slice(0, limit).map(([path]) => snapshot(path));
      return { docs, empty: docs.length === 0 };
    },
  });
  return {
    requireAuth: (request: { auth?: { uid: string } }) => { if (!request.auth) throw new Error('Sign in required'); return request.auth.uid; },
    requireAdmin: async (request: { auth: { uid: string; token: { admin?: boolean } } }) => { if (!request.auth?.token?.admin) throw new Error('Admin only'); return request.auth.uid; },
    db: { collection: (name: string) => ({ ...query(name),
      add: vi.fn(async () => ({ id: 'fixture' })),
      doc: (id: string) => ref(`${name}/${id}`),
    }) },
  };
});
vi.mock('../../functions/src/_shared/stripeClient.js', () => ({ getStripe: vi.fn(async () => state.stripe) }));
import {
  connectV2AccountLink, connectV2AccountStatus, connectV2BillingPortal, connectV2Checkout,
  connectV2CreateAccount, connectV2CreateProduct, connectV2ListProducts, connectV2Subscription,
  createStripeDashboardLink, createTip, processCreatorPayout, startStripeConnectOnboarding,
} from '../../functions/src/stripe';

const UID = 'payments-alice';
const account = () => ({ id: 'acct_alice', metadata: { uid: UID }, details_submitted: true, charges_enabled: true, payouts_enabled: true });
beforeEach(() => {
  // Fail locally if a future edit accidentally bypasses the provider mock.
  vi.spyOn(https, 'request').mockImplementation(() => { throw new Error('Network forbidden in payment fixtures'); });
  vi.spyOn(http, 'request').mockImplementation(() => { throw new Error('Network forbidden in payment fixtures'); });
  state.rows.clear(); state.queryError = null;
  state.rows.set(`creator_profiles/${UID}`, { user_id: UID, stripe_account_id: 'acct_alice' });
  state.rows.set(`profiles/${UID}`, { user_id: UID, stripe_customer_id: 'cus_alice' });
  state.stripe = {
    accounts: { retrieve: vi.fn(async () => account()), create: vi.fn(async () => account()), createLoginLink: vi.fn(async () => ({ url: 'https://stripe.test/dashboard' })) },
    customers: { retrieve: vi.fn(async () => ({ id: 'cus_alice', metadata: { uid: UID } })) },
    accountLinks: { create: vi.fn(async () => ({ url: 'https://stripe.test/onboarding' })) },
    billingPortal: { sessions: { create: vi.fn(async () => ({ url: 'https://stripe.test/billing' })) } },
    checkout: { sessions: { create: vi.fn(async () => ({ id: 'cs_fixture', url: 'https://stripe.test/checkout' })) } },
    products: { create: vi.fn(async () => ({ id: 'prod_fixture' })), list: vi.fn(async () => ({ data: [] })) },
    prices: { create: vi.fn(async () => ({ id: 'price_fixture' })) },
    payouts: { create: vi.fn(async () => ({ id: 'po_fixture', status: 'pending' })) },
  };
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock_only');
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const request = (data = {}) => ({ auth: { uid: UID, token: { admin: true } }, data, rawRequest: {} });
type Callable = typeof connectV2AccountLink;
const run = (callable: Callable, data = {}) => callable.run(request(data) as Parameters<Callable['run']>[0]);
const accountEndpoints: Array<[string, Callable, Record<string, unknown>]> = [
  ['account link', connectV2AccountLink, {}], ['status', connectV2AccountStatus, {}],
  ['onboarding', startStripeConnectOnboarding, {}], ['create account', connectV2CreateAccount, {}],
  ['dashboard', createStripeDashboardLink, {}], ['products list', connectV2ListProducts, {}],
  ['create product', connectV2CreateProduct, { name: 'Fixture', amount: 100 }],
  ['tip', createTip, { creator_user_id: UID, amount: 100 }],
  ['payout', processCreatorPayout, { creator_user_id: UID, amount: 100 }],
];
const noPaymentActions = () => {
  for (const action of [state.stripe.accounts.create, state.stripe.accounts.createLoginLink, state.stripe.accountLinks.create,
    state.stripe.billingPortal.sessions.create, state.stripe.checkout.sessions.create, state.stripe.products.create,
    state.stripe.products.list, state.stripe.prices.create, state.stripe.payouts.create]) expect(action).not.toHaveBeenCalled();
};

describe('Stripe account reference authority', () => {
  it.each(accountEndpoints)('%s rejects an account belonging to someone else before any action', async (_name, callable, data) => {
    state.stripe.accounts.retrieve.mockResolvedValue({ ...account(), metadata: { uid: 'payments-bob' } });
    await expect(run(callable, data)).rejects.toMatchObject({ code: 'failed-precondition' });
    noPaymentActions();
  });
  it.each(accountEndpoints)('%s accepts a server-confirmed owner', async (_name, callable, data) => {
    await expect(run(callable, data)).resolves.toMatchObject({ ok: true });
    expect(state.stripe.accounts.retrieve).toHaveBeenCalledWith('acct_alice');
  });
  it.each([{}, { uid: 'payments-bob' }, null])('rejects missing or unproven ownership metadata %j', async metadata => {
    state.stripe.accounts.retrieve.mockResolvedValue({ ...account(), metadata });
    await expect(run(createStripeDashboardLink)).rejects.toMatchObject({ code: 'failed-precondition' });
    noPaymentActions();
  });
  it.each([{ id: 'acct_other' }, { deleted: true }])('rejects inconsistent/deleted provider records %j', async fields => {
    state.stripe.accounts.retrieve.mockResolvedValue({ ...account(), ...fields });
    await expect(run(createStripeDashboardLink)).rejects.toMatchObject({ code: 'failed-precondition' });
    noPaymentActions();
  });
  it.each([{}, 12, 'acct_/../../other', 'cus_alice'])('does not send malformed account references to Stripe: %j', async id => {
    state.rows.set(`creator_profiles/${UID}`, { user_id: UID, stripe_account_id: id });
    await expect(run(connectV2AccountLink)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.stripe.accounts.retrieve).not.toHaveBeenCalled(); noPaymentActions();
  });
  it('rejects ambiguous canonical and migrated mappings', async () => {
    state.rows.set('creator_profiles/legacy', { user_id: UID, stripe_account_id: 'acct_other' });
    await expect(run(connectV2AccountLink)).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(state.stripe.accounts.retrieve).not.toHaveBeenCalled(); noPaymentActions();
  });
  it('supports one migrated profile after proving provider ownership', async () => {
    state.rows.delete(`creator_profiles/${UID}`);
    state.rows.set('creator_profiles/legacy', { user_id: UID, stripe_account_id: 'acct_alice' });
    await expect(run(connectV2AccountLink)).resolves.toMatchObject({ ok: true });
  });
  it('does not replace an existing verified connected account', async () => {
    await expect(run(connectV2CreateAccount)).resolves.toMatchObject({ account_id: 'acct_alice' });
    expect(state.stripe.accounts.create).not.toHaveBeenCalled();
  });
  it('writes new account ownership metadata on the server', async () => {
    state.rows.delete(`creator_profiles/${UID}`);
    await expect(run(connectV2CreateAccount)).resolves.toMatchObject({ account_id: 'acct_alice' });
    expect(state.stripe.accounts.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: { uid: UID } }), { idempotencyKey: `vybe-connect-account-v1-${UID}` });
  });
  it.each([connectV2CreateAccount, startStripeConnectOnboarding])('provisions the existing migrated application without duplicate payment rows', async callable => {
    state.rows.delete(`creator_profiles/${UID}`);
    state.rows.set('creator_profiles/legacy-application', { user_id: UID, is_approved: true });
    await expect(run(callable)).resolves.toMatchObject({ ok: true });
    expect(state.rows.has(`creator_profiles/${UID}`)).toBe(false);
    expect(state.rows.get('creator_profiles/legacy-application')).toMatchObject({ stripe_account_id: 'acct_alice', is_approved: true });
    await expect(run(connectV2AccountLink)).resolves.toMatchObject({ ok: true });
  });
  it('does not replace a mapping when provider verification fails', async () => {
    state.stripe.accounts.retrieve.mockRejectedValue(new Error('provider unavailable'));
    await expect(run(startStripeConnectOnboarding)).rejects.toThrow('provider unavailable'); noPaymentActions();
  });
});

describe('Stripe customer portal authority', () => {
  it.each([{ metadata: {} }, { metadata: { uid: 'payments-bob' } }, { deleted: true }, { id: 'cus_other' }])('rejects an unverified customer %j', async fields => {
    state.stripe.customers.retrieve.mockResolvedValue({ id: 'cus_alice', metadata: { uid: UID }, ...fields });
    await expect(run(connectV2BillingPortal)).rejects.toMatchObject({ code: 'failed-precondition' }); noPaymentActions();
  });
  it('opens the billing portal after server-side ownership verification', async () => {
    await expect(run(connectV2BillingPortal)).resolves.toMatchObject({ ok: true });
    expect(state.stripe.billingPortal.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_alice' }));
  });
  it('supports a single migrated billing profile', async () => {
    state.rows.delete(`profiles/${UID}`);
    state.rows.set('profiles/migrated', { user_id: UID, stripe_customer_id: 'cus_alice' });
    await expect(run(connectV2BillingPortal)).resolves.toMatchObject({ ok: true });
  });
  it('rejects ambiguous billing profiles', async () => {
    state.rows.set('profiles/duplicate', { user_id: UID, stripe_customer_id: 'cus_other' });
    await expect(run(connectV2BillingPortal)).rejects.toMatchObject({ code: 'failed-precondition' }); noPaymentActions();
  });
});

describe('Incomplete seller checkout fails before payment', () => {
  it.each([connectV2Checkout, connectV2Subscription])('rejects catalog prices instead of falling back to a platform charge', async callable => {
    state.rows.set('business_products/legacy', { stripe_price_id: 'price_catalog', owner_user_id: 'payments-bob', platform_fee_percent: 1 });
    await expect(run(callable, { price_id: 'price_catalog' })).rejects.toMatchObject({ code: 'failed-precondition' }); noPaymentActions();
  });
  it.each([connectV2Checkout, connectV2Subscription])('does not charge when the catalog ownership lookup is unavailable', async callable => {
    state.queryError = new Error('store unavailable');
    await expect(run(callable, { price_id: 'price_platform' })).rejects.toThrow('store unavailable'); noPaymentActions();
  });
  it.each([connectV2Checkout, connectV2Subscription])('retains existing platform-only checkout', async callable => {
    await expect(run(callable, { price_id: 'price_platform' })).resolves.toMatchObject({ ok: true });
    expect(state.stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ metadata: { uid: UID } }));
    expect(state.stripe.checkout.sessions.create.mock.calls[0][0]).not.toHaveProperty('payment_intent_data');
  });
});
