import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/nativePerfMode', () => ({ isNativePerfMode: () => false }));
const signing = vi.hoisted(() => ({ batch: vi.fn(), needed: vi.fn(), network: {isOnline:true,isSlowConnection:false,saveData:false} }));
vi.mock('@/lib/signedUrlCache', () => ({ batchSignUrls: signing.batch, needsSigning: signing.needed, getCachedSignedUrl: (url: string) => url }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => signing.network }));
let videos: HTMLVideoElement[];
beforeEach(() => {
  vi.useFakeTimers(); vi.resetModules(); videos=[]; signing.batch.mockResolvedValue(undefined); signing.needed.mockReturnValue(false); signing.network={isOnline:true,isSlowConnection:false,saveData:false};
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((name, options) => { const node = create(name, options); if(name==='video'){ vi.spyOn(node as HTMLVideoElement,'load').mockImplementation(()=>{}); videos.push(node as HTMLVideoElement); } return node; });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('detached video resource teardown', () => {
  it.each(['metadata','full'] as const)('%s preload releases callbacks, source and timeout exactly once', async kind => {
    const {preloadVideoMetadata,preloadVideo}=await import('./useVideoPreload');
    const pending=(kind==='metadata'?preloadVideoMetadata:preloadVideo)('https://example.com/fixture.mp4');
    const video=videos[0]; const finish=kind==='metadata'?video.onloadedmetadata:video.oncanplaythrough;
    finish!.call(video,new Event('loadedmetadata')); await pending;
    expect(video.hasAttribute('src')).toBe(false); expect(video.onerror).toBeNull(); expect(video.onloadedmetadata).toBeNull(); expect(video.oncanplaythrough).toBeNull();
    expect(vi.getTimerCount()).toBe(0); await vi.advanceTimersByTimeAsync(6000); expect(video.load).toHaveBeenCalledOnce();
  });
  it('first-frame warming releases callbacks and cannot load again on its obsolete timer', async () => {
    const {warmMediaAhead}=await import('./useAheadMediaPreload');
    warmMediaAhead([{url:'https://example.com/fixture.mp4',isVideo:true}]);
    const video=videos[0]; video.onloadeddata!.call(video,new Event('loadeddata')); await Promise.resolve();
    expect(video.hasAttribute('src')).toBe(false); expect(video.onerror).toBeNull(); expect(video.onloadeddata).toBeNull(); expect(video.onloadedmetadata).toBeNull();
    expect(vi.getTimerCount()).toBe(0); await vi.advanceTimersByTimeAsync(6000); expect(video.load).toHaveBeenCalledOnce();
  });
});

it('clear preload cache settles active work without leaving callbacks or a late deadline', async () => {
  const {preloadVideoMetadata,clearPreloadCache}=await import('./useVideoPreload');
  const result=preloadVideoMetadata('https://example.com/cancel.mp4').catch(error=>error.name);
  clearPreloadCache(); await expect(result).resolves.toBe('AbortError');
  expect(videos[0].hasAttribute('src')).toBe(false); expect(videos[0].onerror).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  clearPreloadCache(); expect(videos[0].load).toHaveBeenCalledOnce();
});
it('an unsuccessful preload times out once and releases its decoder', async () => {
  const {preloadVideoMetadata}=await import('./useVideoPreload');
  const result=preloadVideoMetadata('https://example.com/timeout.mp4').catch(error=>error.message);
  await vi.advanceTimersByTimeAsync(3000); await expect(result).resolves.toBe('Video preload timed out');
  expect(videos[0].onerror).toBeNull(); expect(videos[0].load).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it('leaving the feed cancels scheduled metadata loads before any video is created', async () => {
  const {useVideoPreload}=await import('./useVideoPreload');
  const hook=renderHook(()=>useVideoPreload(['https://example.com/idle.mp4']));
  hook.unmount(); await vi.advanceTimersByTimeAsync(3000);
  expect(videos).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
});
it('window changes retire active metadata work without letting an older completion clear the newer reservation', async () => {
  const {useVideoPreload}=await import('./useVideoPreload');
  const hook=renderHook(({index})=>useVideoPreload(['https://example.com/a.mp4','https://example.com/b.mp4'],{currentIndex:index,preloadDepth:1}),{initialProps:{index:0}});
  await act(async()=>vi.advanceTimersByTimeAsync(0)); expect(videos).toHaveLength(1);
  hook.rerender({index:1}); await act(async()=>vi.advanceTimersByTimeAsync(0));
  expect(videos).toHaveLength(2); expect(videos[0].hasAttribute('src')).toBe(false); expect(videos[0].onerror).toBeNull();
  expect(videos[1].hasAttribute('src')).toBe(true); hook.unmount(); await Promise.resolve();
  expect(videos[1].hasAttribute('src')).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it('a signing response after unmount cannot warm the old feed', async () => {
  const {useAheadMediaPreload}=await import('./useAheadMediaPreload');
  let finish!:()=>void; signing.needed.mockReturnValue(true); signing.batch.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}));
  const posts=[{id:'a',type:'short',media_url:'https://example.com/current.mp4'},{id:'b',type:'short',media_url:'https://example.com/signing.mp4'}];
  const hook=renderHook(()=>useAheadMediaPreload(posts,0)); hook.unmount(); signing.needed.mockReturnValue(false);
  await act(async()=>{finish();await Promise.resolve()}); expect(videos).toHaveLength(0);
});
it('leaving a saturated first-frame window releases active videos and removes queued loads', async () => {
  const {useAheadMediaPreload}=await import('./useAheadMediaPreload');
  const posts=Array.from({length:9},(_,i)=>({id:String(i),type:'short',media_url:`https://example.com/queued-${i}.mp4`}));
  const hook=renderHook(()=>useAheadMediaPreload(posts,0,10)); expect(videos).toHaveLength(6);
  hook.unmount(); await act(async()=>{for(let i=0;i<10;i++)await Promise.resolve()});
  expect(videos).toHaveLength(6); videos.forEach(video=>{expect(video.hasAttribute('src')).toBe(false);expect(video.onerror).toBeNull();expect(video.load).toHaveBeenCalledOnce()}); expect(vi.getTimerCount()).toBe(0);
});

it('the visible clip owns its fetch while only the next clip is warmed', async () => {
 const {useAheadMediaPreload}=await import('./useAheadMediaPreload');
 const posts=[{id:'a',type:'short',media_url:'https://example.com/current.mp4'},{id:'b',type:'short',media_url:'https://example.com/next.mp4'}];
 const hook=renderHook(()=>useAheadMediaPreload(posts,0)); expect(videos).toHaveLength(1); expect(videos[0].src).toBe('https://example.com/next.mp4');
 hook.unmount(); await Promise.resolve(); expect(vi.getTimerCount()).toBe(0);
});
it.each(['isSlowConnection','saveData'] as const)('avoids speculative video decoding with %s', async flag => {
 signing.network[flag]=true; const {useAheadMediaPreload}=await import('./useAheadMediaPreload');
 const posts=[{id:'a',type:'short',media_url:'https://example.com/current.mp4'},{id:'b',type:'short',media_url:'https://example.com/next.mp4'}];
 const hook=renderHook(()=>useAheadMediaPreload(posts,0)); expect(videos).toHaveLength(0); hook.unmount();
});
