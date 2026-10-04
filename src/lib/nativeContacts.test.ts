import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ native: false, call: vi.fn(), select: vi.fn() }));
vi.mock('@/lib/despiaBridge', () => ({ isDespiaRuntime: () => mock.native, despiaCall: mock.call }));
import { readDeviceContacts } from './nativeContacts';
beforeEach(() => { mock.native = false; mock.call.mockReset(); mock.select.mockReset(); Object.defineProperty(navigator, 'contacts', { configurable: true, value: { select: mock.select } }); });
it('uses the browser picker without requiring a ContactsManager global and retains multiple phones', async () => {
  mock.select.mockResolvedValue([{ name: ['Bob'], tel: ['+15555550100', '+15555550101'] }]);
  await expect(readDeviceContacts()).resolves.toEqual([{ name: 'Bob', phones: ['+15555550100', '+15555550101'] }]);
});
it.each([['AbortError', 'contacts_cancelled'], ['NotAllowedError', 'contacts_blocked'], ['SecurityError', 'contacts_blocked'], ['UnknownError', 'contacts_failed']])('distinguishes picker failure %s', async (name, error) => {
  mock.select.mockRejectedValue(Object.assign(new Error('Private device error'), { name })); await expect(readDeviceContacts()).rejects.toThrow(error);
});
it('does not open a second picker after an empty native selection', async () => {
  mock.native = true; mock.call.mockResolvedValueOnce({}).mockResolvedValueOnce({ contacts: [] });
  await expect(readDeviceContacts()).resolves.toEqual([]); expect(mock.select).not.toHaveBeenCalled();
});
