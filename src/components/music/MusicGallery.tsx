import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Disc, Play, Pause, Share, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { publishMusicPost } from '@/lib/musicWriteResults';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { useMusicPlayback } from '@/hooks/useMusicPlayback';
import { readMusicCatalog, type MusicPreview } from '@/lib/musicCatalogService';
import * as Dialog from '@radix-ui/react-dialog';

interface MusicGalleryProps { onSelectTrack?: (track: MusicPreview) => void; onClose: () => void }

// A selection cannot attach audio until the video export pipeline supports mixing.
export function MusicGallery({ onClose }: MusicGalleryProps) {
  const [open, setOpen] = useState(true);
  const [opener] = useState(() => typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const { user, profile } = useAuth();
  const session = useReportAccountSession();
  const ready = !!user && profile?.user_id === user.id && session.uid === user.id;
  const key = `${user?.id}:${profile?.id}:${session.epoch}`;
  const close = () => { setOpen(false); onClose(); };
  return <Dialog.Root open={open} onOpenChange={next => { if (!next) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[8000] bg-background" />
      <Dialog.Content className="fixed inset-0 z-[8001] bg-background outline-none" onCloseAutoFocus={event => { event.preventDefault(); if (opener?.isConnected) opener.focus(); }}>
        <MusicCatalogView key={key} uid={ready ? user.id : ''} profileId={ready ? profile.id : ''} onClose={close} />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

function MusicCatalogView({ uid, profileId, onClose }: { uid: string; profileId: string; onClose: () => void }) {
  const [tracks, setTracks] = useState<MusicPreview[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [genre, setGenre] = useState('');
  const [selected, setSelected] = useState<MusicPreview | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(0);
  const mounted = useRef(false), request = useRef(0);
  const seenCursors = useRef(new Set<string>());
  const playback = useMusicPlayback(selected?.preview_url || '', selected?.preview_seconds || 30);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++; }; }, []);
  const load = useCallback(async (next?: string) => {
    const operation = ++request.current;
    const guard = () => { if (!mounted.current || request.current !== operation) throw new Error('Gallery closed.'); };
    setLoading(true); setError('');
    try {
      const page = await readMusicCatalog(uid, profileId, next, guard); guard();
      if (page.nextCursor && (page.nextCursor === next || (next && seenCursors.current.has(page.nextCursor)))) throw new Error('Music pagination could not be verified. Close and reopen the gallery.');
      if (!next) seenCursors.current.clear();
      if (page.nextCursor) seenCursors.current.add(page.nextCursor);
      setTracks(old => next ? [...new Map([...old, ...page.tracks].map(track => [track.track_id, track])).values()] : page.tracks);
      setUnavailable(old => next ? old + page.unavailableCount : page.unavailableCount); setCursor(page.nextCursor);
    } catch (failure) { if (mounted.current && request.current === operation) setError(failure instanceof Error ? failure.message : 'Music could not be loaded. Please retry.'); }
    finally { if (mounted.current && request.current === operation) setLoading(false); }
  }, [uid, profileId]);
  useEffect(() => { if (uid && profileId) void load(); }, [uid, profileId, load]);
  const genres = useMemo(() => [...new Set(tracks.map(track => track.genre))].sort(), [tracks]);
  const filtered = useMemo(() => tracks.filter(track => (!genre || track.genre === genre) && `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(search.toLowerCase())), [tracks, genre, search]);

  async function share(track: MusicPreview) {
    if (sharing) return;
    const account = reportAccountGuard(uid), guard = () => { account(); if (!mounted.current) throw new Error('Gallery closed.'); };
    try {
      guard(); setSharing(track.track_id);
      await publishMusicPost({ author_id: profileId, type: 'post', caption: `Listening to "${track.title}" by ${track.artist} 🎵\n#music`, ...(track.artwork_url ? { media_url: track.artwork_url } : {}) });
      guard(); toast.success('Track shared to your feed.');
    } catch { try { guard(); toast.error('Failed to share track'); } catch { /* Retired view. */ } }
    finally { try { guard(); setSharing(null); } catch { /* Retired view. */ } }
  }
  return <div className="h-full bg-background flex flex-col">
    <header className="flex items-center justify-between border-b p-4"><Dialog.Title asChild><h1 className="text-xl font-bold">Music Gallery</h1></Dialog.Title><Button variant="ghost" size="icon" aria-label="Close music gallery" onClick={() => { playback.stop(); onClose(); }}><X className="h-5 w-5" /></Button></header>
    <div className="p-4 space-y-3 border-b">
      <Dialog.Description className="text-sm text-muted-foreground">Listen to approved previews, up to 30 seconds. Adding music to videos is not available yet.</Dialog.Description>
      <p className="text-xs text-muted-foreground">Activity counts are unavailable. Sharing posts the track name and artwork, without audio.</p>
      <div className="flex gap-2"><Input aria-label="Search music" placeholder="Search loaded songs or artists" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Music genre" className="rounded border bg-background max-w-32" value={genre} onChange={event => setGenre(event.target.value)}><option value="">All genres</option>{genres.map(value => <option key={value}>{value}</option>)}</select></div>
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
      {!uid && <p role="status">Waiting for your account…</p>}
      {error && <div role="alert"><p>{error}</p><Button onClick={() => void load(cursor || undefined)} disabled={loading}>Retry music</Button></div>}
      {loading && <p role="status">Loading music…</p>}
      {!loading && !error && uid && filtered.length === 0 && <p>{tracks.length ? 'No loaded previews match your search.' : 'No approved previews are available yet.'}</p>}
      {unavailable > 0 && <p className="text-sm text-muted-foreground">Some catalog entries have no current approved preview.</p>}
      {filtered.map(track => <article key={track.track_id} className="rounded-xl border p-3 flex flex-wrap items-center gap-3">
        {track.artwork_url ? <img src={track.artwork_url} alt="" referrerPolicy="no-referrer" className="h-12 w-12 rounded object-cover" /> : <Disc className="h-10 w-10 text-muted-foreground" />}
        <div className="flex-1 min-w-32"><h2 className="font-semibold">{track.title}</h2><p className="text-sm text-muted-foreground">{track.artist} · {track.genre}</p><p className="text-xs">{track.asset_kind === 'app_sound_effect' ? 'App sound effect' : 'Music preview'} · {track.preview_seconds}s</p></div>
        <Button variant="outline" aria-label={`Preview ${track.title}`} onClick={() => { playback.stop(); setSelected(track); }}>Preview</Button>
        <Button variant="outline" title="Share to feed" aria-label={`Share ${track.title} to feed`} disabled={sharing !== null} onClick={() => void share(track)}><Share className="h-4 w-4" /></Button>
      </article>)}
      {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(cursor)}>Load more previews</Button>}
    </div>
    {selected && <section aria-label="Preview controls" className="p-4 border-t space-y-2 bg-card pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between gap-2"><p className="font-medium truncate">{selected.title}</p><Button variant="ghost" size="icon" aria-label="Close preview" onClick={() => { playback.stop(); setSelected(null); }}><X className="h-4 w-4" /></Button></div>
      {playback.error && <p role="alert" className="text-sm">{playback.error}</p>}
      <div className="flex items-center gap-3"><Button onClick={playback.toggle} aria-label={playback.isPlaying || playback.isLoading ? 'Pause preview' : 'Play preview'}>{playback.isPlaying || playback.isLoading ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}{playback.isLoading ? 'Starting…' : playback.isPlaying ? 'Pause' : 'Play'}</Button><span className="text-sm tabular-nums">{Math.floor(playback.currentTime)} / {selected.preview_seconds}s</span><label className="ml-auto text-sm">Volume<input aria-label="Preview volume" type="range" min="0" max="1" step="0.05" value={playback.volume} onChange={event => playback.setVolume(Number(event.target.value))} className="block w-24" /></label></div>
    </section>}
  </div>;
}
