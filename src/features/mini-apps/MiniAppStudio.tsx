import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Code2, Download, Eye, FolderOpen, Save, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MINI_APP_CATEGORIES, MINI_APP_CODE_LIMIT, miniAppError, validateMiniApp, type MiniAppRecord, type MiniAppSource } from './model';
import { publishMiniApp, saveMiniAppDraft, type MiniAppPublishIntent } from './repository';
import { MINI_APP_TEMPLATES } from './templates';
import { MiniAppRunner } from './MiniAppRunner';
import { clearMiniAppRecovery, readMiniAppRecoveryEntry, saveMiniAppRecovery } from './recovery';
import { useTheme } from '@/lib/theme';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { downloadMiniAppFile, readMiniAppFile } from './sourceFile';

export function MiniAppStudio({ ownerId, draft, onClose, onSaved }: {
  ownerId: string;
  draft: MiniAppRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [recovery] = useState(() => readMiniAppRecoveryEntry(ownerId, draft?.id));
  const [pendingId, setPendingId] = useState(() => draft?.id || recovery?.pendingId || crypto.randomUUID());
  const [source, setSource] = useState<MiniAppSource>(() => recovery?.source || (draft ? validateMiniApp(draft) : { ...MINI_APP_TEMPLATES[0].source }));
  const [savedDraft, setSavedDraft] = useState(draft);
  const [savedSource, setSavedSource] = useState(draft ? JSON.stringify(validateMiniApp(draft)) : '');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<MiniAppSource | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const locked = busy || importing;
  const [publishOpen, setPublishOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [preview, setPreview] = useState<MiniAppSource | null>(null);
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [failure, setFailure] = useState<{ message: string; publish: boolean; conflict: boolean; copyId?: string; intent?: MiniAppPublishIntent } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [wrapCode, setWrapCode] = useState(true);
  const previewPanel = useRef<HTMLDivElement>(null);
  const editorPanel = useRef<HTMLDivElement>(null);
  const { reducedMotion: appReducedMotion } = useTheme();
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = appReducedMotion || systemReducedMotion;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const dirty = JSON.stringify(source) !== savedSource;
  const codeSize = source.html.length + source.css.length + source.javascript.length;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (dirty) setRecoverySaved(saveMiniAppRecovery(ownerId, source, savedDraft?.id, pendingId));
    else { clearMiniAppRecovery(ownerId, savedDraft?.id); setRecoverySaved(false); }
  }, [dirty, ownerId, savedDraft?.id, source, pendingId]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  useEffect(() => {
    if (!previewVersion) return;
    previewPanel.current?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    previewPanel.current?.focus({ preventScroll: true });
  }, [previewVersion, reducedMotion]);

  const save = async (publish = false, copyId?: string, retryIntent?: MiniAppPublishIntent) => {
    const intent = publish ? retryIntent ?? { requestId: crypto.randomUUID() } : undefined;
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure(null);
    let draftSaved = false;
    try {
      const valid = validateMiniApp(source);
      const record = await saveMiniAppDraft(ownerId, valid, copyId ? null : savedDraft, copyId || pendingId);
      if (!mounted.current) return;
      clearMiniAppRecovery(ownerId, savedDraft?.id);
      setSavedDraft(record);
      setPendingId(record.id);
      if (copyId) setPublishedId(null);
      setSavedSource(JSON.stringify(valid));
      setSource(valid);
      draftSaved = true;
      onSaved();
      if (publish) {
        setPublishing(true);
        await publishMiniApp(ownerId, record, intent);
        if (!mounted.current) return;
        setPublishedId(record.id);
        toast.success('Your mini app is live in the Hub.');
        triggerHaptic('success'); playSound('success');
        onSaved();
      } else toast.success('Private draft saved.');
    } catch (error) {
      if (mounted.current) {
        const message = draftSaved && publish ? `Your private draft was saved, but publishing failed. ${miniAppError(error, 'publish')}` : miniAppError(error, publish ? 'publish' : 'save');
        setFailure({ message, publish, copyId, intent, conflict: !!error && typeof error === 'object' && 'code' in error && error.code === 'mini-app-conflict' }); toast.error(message);
      }
    } finally {
      if (mounted.current) { setBusy(false); setPublishing(false); }
      inFlight.current = false;
    }
  };

  const updatePreview = () => {
    try { setPreview(validateMiniApp(source)); setPreviewVersion(value => value + 1); }
    catch (error) { toast.error(miniAppError(error)); }
  };

  const exportSource = () => {
    try { downloadMiniAppFile(source); }
    catch (error) { toast.error(miniAppError(error)); }
  };
  const importSource = async (file: File) => {
    if (inFlight.current) return;
    inFlight.current = true; setImporting(true);
    try {
      const imported = await readMiniAppFile(file);
      if (mounted.current) setPendingImport(imported);
    } catch (error) { if (mounted.current) toast.error(miniAppError(error)); }
    finally { inFlight.current = false; if (mounted.current) setImporting(false); }
  };
  const applyImport = () => {
    if (!pendingImport) return;
    clearMiniAppRecovery(ownerId, savedDraft?.id);
    setSource(pendingImport); setSavedDraft(null); setSavedSource(''); setPendingId(crypto.randomUUID());
    setPreview(null); setFailure(null); setPublishedId(null); setPendingImport(null);
  };

  const applyTemplate = (id: string) => {
    const template = MINI_APP_TEMPLATES.find(item => item.id === id);
    if (template) { setSource({ ...template.source }); setPreview(null); }
    setPendingTemplate(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" disabled={locked} onClick={() => dirty ? setDiscardOpen(true) : onClose()}><ArrowLeft />Back to mini apps</Button>
        <span role="status" className="text-xs text-muted-foreground">{importing ? 'Reading mini-app file…' : publishing ? 'Publishing snapshot…' : busy ? 'Saving private draft…' : dirty ? recoverySaved ? 'Recovery saved on this device · Save draft to sync' : 'Unsaved changes' : 'Private draft saved'}</span>
      </div>
      <div><h1 className="text-2xl font-bold">Mini app studio</h1><p className="mt-1 text-sm text-muted-foreground">Build something small. Make it yours. Share it with the Hub.</p></div>
      <fieldset disabled={locked} className="space-y-5">
        <div className="flex flex-wrap items-center gap-2" aria-label="Mini-app files">
          <Button type="button" variant="outline" size="sm" onClick={() => importInput.current?.click()}><FolderOpen />Import code</Button>
          <Button type="button" variant="outline" size="sm" onClick={exportSource}><Download />Export code</Button>
          <span className="text-xs text-muted-foreground">Keep a copy or open a Vybe mini-app file.</span>
          <input ref={importInput} type="file" accept=".json,application/json" aria-label="Import mini-app file" className="hidden" onChange={event => {
            const file = event.target.files?.[0]; event.target.value = ''; if (file) void importSource(file);
          }} />
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Starter templates">
          {MINI_APP_TEMPLATES.map(item => <Button key={item.id} size="sm" variant="outline" onClick={() => dirty ? setPendingTemplate(item.id) : applyTemplate(item.id)}>{item.label}</Button>)}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium">App name<Input value={source.title} maxLength={60} onChange={event => setSource({ ...source, title: event.target.value })} /></label>
          <label className="space-y-2 text-sm font-medium">Category<select className="flex h-10 w-full rounded-xl border border-input bg-background px-3" value={source.category} onChange={event => setSource({ ...source, category: event.target.value as MiniAppSource['category'] })}>{MINI_APP_CATEGORIES.map(category => <option key={category} value={category}>{category[0].toUpperCase() + category.slice(1)}</option>)}</select></label>
          <label className="space-y-2 text-sm font-medium sm:col-span-2">Description<Textarea value={source.description} maxLength={240} rows={2} placeholder="Tell people what your app does" onChange={event => setSource({ ...source, description: event.target.value })} /></label>
        </div>
        <div ref={editorPanel} className="scroll-mt-20 rounded-2xl border border-border bg-card/70 p-3 sm:p-4" onKeyDown={event => {
          if (!(event.ctrlKey || event.metaKey)) return;
          if (event.key.toLowerCase() === 's') { event.preventDefault(); void save(); }
          if (event.key === 'Enter') { event.preventDefault(); updatePreview(); }
        }}>
          <Tabs defaultValue="html">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <TabsList><TabsTrigger value="html">HTML</TabsTrigger><TabsTrigger value="css">CSS</TabsTrigger><TabsTrigger value="javascript">JavaScript</TabsTrigger></TabsList>
              <Button type="button" variant="ghost" size="sm" aria-pressed={wrapCode} onClick={() => setWrapCode(value => !value)}>Wrap code</Button>
            </div>
            {(['html', 'css', 'javascript'] as const).map(language => <TabsContent key={language} value={language}><Textarea aria-label={`${language === 'javascript' ? 'JavaScript' : language.toUpperCase()} code`} className="min-h-[280px] max-h-[70vh] resize-y rounded-xl bg-background/80 font-mono text-base leading-relaxed sm:min-h-[320px] sm:text-sm" value={source[language]} wrap={wrapCode ? 'soft' : 'off'} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={event => setSource({ ...source, [language]: event.target.value })} /></TabsContent>)}
          </Tabs>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span className={codeSize > MINI_APP_CODE_LIMIT ? 'text-destructive' : undefined}>{codeSize.toLocaleString()} / 100,000 characters</span><span>Ctrl/⌘ S to save · Ctrl/⌘ Enter to preview</span></div>
        </div>
        <div className="z-20 flex flex-wrap gap-2 rounded-2xl border border-border bg-background/95 p-3 backdrop-blur-md sm:sticky sm:bottom-20">
          <Button variant="outline" onClick={updatePreview}><Eye />{preview ? 'Update preview' : 'Preview'}</Button>
          <Button variant="outline" onClick={() => void save()}><Save />Save draft</Button>
          <Button onClick={() => { try { validateMiniApp(source); setPublishOpen(true); } catch (error) { toast.error(miniAppError(error)); } }}><Upload />Publish to Hub</Button>
        </div>
      </fieldset>
      {failure && <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm"><p>{failure.message}</p><p className="mt-1 text-muted-foreground">Your code is still in the editor.</p><Button className="mt-3" variant="outline" disabled={locked} onClick={() => void save(failure.publish, failure.copyId, failure.intent)}>{failure.publish ? 'Retry publishing' : 'Retry save'}</Button>{failure.conflict && <Button className="mt-3 ml-2" disabled={locked} onClick={() => void save(false, crypto.randomUUID())}>Save as new draft</Button>}</div>}
      {publishedId && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4"><p className="text-sm">Your published snapshot is live. New edits stay private.</p><Button asChild variant="outline"><Link to={`/mini-apps/${publishedId}`}>Open published app</Link></Button></div>}
      {preview && <div ref={previewPanel} tabIndex={-1} className="scroll-mt-20 space-y-2 outline-none"><p className="text-sm text-muted-foreground">{JSON.stringify(source) !== JSON.stringify(preview) ? 'Your code has changed. Update preview to load the latest version.' : 'Preview uses the code from your last update.'}</p><Button size="sm" variant="ghost" onClick={() => {
        setPreview(null);
        editorPanel.current?.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        editorPanel.current?.querySelector<HTMLTextAreaElement>('[role="tabpanel"][data-state="active"] textarea')?.focus({ preventScroll: true });
      }}><ArrowLeft />Close preview</Button><MiniAppRunner key={previewVersion} source={preview} /></div>}
      <div className="flex gap-3 rounded-2xl bg-primary/5 p-4 text-sm text-muted-foreground"><Code2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>Use HTML, CSS, and plain JavaScript with inline images. External libraries and fetch requests are blocked. Your code has no VYBE account access or persistent browser storage. Public source can be read by other signed-in members. Test on a small screen before publishing.</p></div>
      <AlertDialog open={Boolean(pendingImport)} onOpenChange={open => { if (!open) setPendingImport(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Open imported code?</AlertDialogTitle><AlertDialogDescription>“{pendingImport?.title || 'Untitled draft'}” will open as a new private draft. Unsaved edits and the recovered new draft on this device will be replaced. Saved and published apps stay as they are. The code will not run or publish automatically.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><Button variant="outline" onClick={exportSource}>Export current code</Button><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={applyImport}>Open as new draft</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Publish {source.title}?</AlertDialogTitle><AlertDialogDescription>This saves your current code and makes a public snapshot available to signed-in VYBE members. Future draft edits stay private until you publish again. Only publish content and code you have the right to share.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => void save(true)}>Publish app</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={discardOpen || Boolean(pendingTemplate)} onOpenChange={open => { if (!open) { setDiscardOpen(false); setPendingTemplate(null); } }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your saved draft and published app will stay as they are. Changes since your last save will be lost.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { clearMiniAppRecovery(ownerId, savedDraft?.id); if (pendingTemplate) applyTemplate(pendingTemplate); else onClose(); }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
