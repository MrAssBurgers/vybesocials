import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', listener: null as null | ((user: { uid: string }) => void) }));
const auth = vi.hoisted(() => ({ get currentUser() { return { uid: state.uid }; }, onAuthStateChanged(listener: typeof state.listener) { state.listener = listener; return () => {}; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
import { reportAccountSnapshot } from './reportModerationService';
import { readDmDraft, writeDmDraft } from './dmDraftStorage';
function switchTo(uid: string) { state.uid = uid; state.listener?.({ uid }); }
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); switchTo('alice'); reportAccountSnapshot(); });

describe('private message drafts', () => {
  it('keeps two participants unsent text separate even for the same conversation', () => {
    writeDmDraft('shared-cid', 'Alice unsent text');
    switchTo('bob');
    expect(readDmDraft('shared-cid')).toBe('');
    writeDmDraft('shared-cid', 'Bob unsent text');
    switchTo('alice');
    expect(readDmDraft('shared-cid')).toBe('Alice unsent text');
    expect(readDmDraft('other-cid')).toBe('');
    expect(localStorage.length).toBe(0);
  });
  it('never reads old ownerless localStorage drafts', () => {
    localStorage.setItem('draft:shared-cid', 'Another account secret');
    expect(readDmDraft('shared-cid')).toBe('');
  });
  it('rejects late writes and clears only the active account draft', () => {
    const before = reportAccountSnapshot();
    writeDmDraft('shared-cid', 'Alice');
    switchTo('bob'); writeDmDraft('shared-cid', 'Bob');
    writeDmDraft('shared-cid', 'Late Alice', before);
    expect(readDmDraft('shared-cid')).toBe('Bob');
    writeDmDraft('shared-cid', '');
    expect(readDmDraft('shared-cid')).toBe('');
    switchTo('alice');
    expect(readDmDraft('shared-cid')).toBe('Alice');
    writeDmDraft('shared-cid', 'Late old epoch', before);
    expect(readDmDraft('shared-cid')).toBe('Alice');
  });
});
