import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountExportSections } from '../../functions/src/_shared/accountExportAuthority';
const state = vi.hoisted(() => ({ session: { uid: 'alice' as string | undefined, epoch: 1 }, user: null as any, invoke: vi.fn() }));
vi.mock('./reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('./firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.user }) }));
vi.mock('./firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => state.invoke(...args) }));
import { collectAccountDataExport } from './accountDataExport';
const names = Object.keys(accountExportSections), created = Date.parse('2026-01-01');
function frame(request: any, records?: any[], nextAfter: string | null = null) {
  return { data: { ok: true, version: 1, ownerUid: request.expectedOwnerUid, profileId: request.expectedProfileId, accountCreatedAt: request.expectedAccountCreatedAt, requestId: request.requestId, section: request.section, after: request.after, sections: names, records: records ?? (request.section === 'profile' ? [{ id: 'profile-alice', user_id: 'alice', username: 'alice' }] : []), nextAfter, readAt: '2026-10-06T12:00:00Z' }, error: null };
}
function pending<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('Blob', NodeBlob);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  window.dispatchEvent(new Event('app-resumed'));
  state.session = { uid: 'alice', epoch: state.session.epoch + 1 }; state.user = { uid: 'alice', metadata: { creationTime: '2026-01-01' } };
  state.invoke.mockImplementation(async (_name, request) => frame(request));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('complete checked personal export collection', () => {
  it('collects all advertised sections and every post page into one JSON download', async () => {
    state.invoke.mockImplementation(async (_name, request) => request.section === 'posts' ? frame(request, [{ id: request.after ? 'post2' : 'post1', author_id: 'profile-alice', caption: request.after ? 'second' : 'first' }], request.after ? null : 'post1') : frame(request));
    const blob = await collectAccountDataExport('alice','profile-alice'); const result = JSON.parse(await blob.text());
    expect(result.sections.posts.map((row:any) => row.caption)).toEqual(['first','second']);
    expect(Object.keys(result.sections).sort()).toEqual([...names].sort());
    expect(result.format).toBe('vybe-personal-data');
    expect(state.invoke).toHaveBeenCalledWith('manageAccount', expect.objectContaining({ action: 'export', expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', expectedAccountCreatedAt: created }));
  });
  it('bounds section transports at three pending calls', async () => {
    let active = 0, high = 0;
    state.invoke.mockImplementation(async (_name, request) => { active++; high = Math.max(high, active); await Promise.resolve(); await Promise.resolve(); active--; return frame(request); });
    await collectAccountDataExport('alice','profile-alice'); expect(high).toBe(3);
  });
  it('rejects the deployed profile-only stub instead of calling it a complete export', async () => {
    state.invoke.mockResolvedValue({ data: { ok: true, success: true, profile: { user_id: 'alice' } }, error: null });
    await expect(collectAccountDataExport('alice','profile-alice')).rejects.toThrow('could not be verified'); expect(state.invoke).toHaveBeenCalledOnce();
  });
  it.each(['ownerUid','profileId','accountCreatedAt','requestId','section','after','sections','records','nextAfter'])('rejects an invalid %s acknowledgement', async key => {
    state.invoke.mockImplementation(async (_name, request) => { const value = frame(request); (value.data as any)[key] = 'wrong'; return value; });
    await expect(collectAccountDataExport('alice','profile-alice')).rejects.toThrow('could not be verified');
  });
  it('rejects a peer-owned record even with a matching outer receipt', async () => {
    state.invoke.mockImplementation(async (_name, request) => frame(request, request.section === 'messages' ? [{ id: 'peer', sender_id: 'bob', content: 'peer' }] : undefined));
    await expect(collectAccountDataExport('alice','profile-alice')).rejects.toThrow('could not be verified');
  });
  it('rejects repeated cursors instead of looping or returning partial data', async () => {
    state.invoke.mockImplementation(async (_name, request) => request.section === 'posts' ? frame(request, [{ id: 'post1', author_id: 'profile-alice' }], 'post1') : frame(request));
    await expect(collectAccountDataExport('alice','profile-alice')).rejects.toThrow('could not be verified');
  });
  it('does not resolve a partial Blob after a later page fails', async () => {
    state.invoke.mockImplementation(async (_name, request) => request.section === 'posts' && request.after ? { data: null, error: new Error('Unavailable') } : request.section === 'posts' ? frame(request, [{ id:'p1',author_id:'profile-alice' }],'p1') : frame(request));
    await expect(collectAccountDataExport('alice','profile-alice')).rejects.toThrow('Unavailable');
  });
  it.each(['account','incarnation','native-phase'])('retires a pending first page across %s changes', async kind => {
    const task = pending<any>(); state.invoke.mockImplementationOnce((_name, request) => task.promise.then(() => frame(request)));
    const result = collectAccountDataExport('alice','profile-alice'); const assertion = expect(result).rejects.toThrow();
    if (kind === 'account') state.session = { uid:'alice',epoch:state.session.epoch+2 };
    if (kind === 'incarnation') state.user.metadata.creationTime='2026-02-01';
    if (kind === 'native-phase') { window.dispatchEvent(new Event('app-paused')); window.dispatchEvent(new Event('app-resumed')); }
    task.resolve(null); await assertion; expect(state.invoke).toHaveBeenCalledOnce();
  });
  it('honors the current profile guard before every additional page', async () => {
    let valid = true; state.invoke.mockImplementation(async (_name, request) => { const value=frame(request); if(request.section==='posts') valid=false; return value; });
    await expect(collectAccountDataExport('alice','profile-alice',()=>{if(!valid)throw new Error('Profile retired')})).rejects.toThrow('Profile retired');
  });
  it.each(['offline','paused'])('sends no export requests when %s', async reason => {
    if(reason==='offline') Object.defineProperty(navigator,'onLine',{configurable:true,value:false}); else window.dispatchEvent(new Event('app-paused'));
    await expect(collectAccountDataExport('alice','profile-alice')).rejects.toThrow('interrupted'); expect(state.invoke).not.toHaveBeenCalled();
  });
  it('bounds a stalled page and ignores its late reply', async () => {
    vi.useFakeTimers(); const task=pending<any>(); state.invoke.mockImplementationOnce((_name,request)=>task.promise.then(()=>frame(request)));
    const result=collectAccountDataExport('alice','profile-alice'); const assertion=expect(result).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(15001); await assertion; task.resolve(null); await Promise.resolve(); expect(state.invoke).toHaveBeenCalledOnce();
  });
});
