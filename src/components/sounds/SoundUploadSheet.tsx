import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { useUploadSound } from '@/hooks/useUploadSound';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { soundContentType } from '@/lib/soundUploadService';
interface Props { open: boolean; onClose: () => void; onPublished?: (id: string) => void }
export function SoundUploadSheet(props: Props) {
  const session = useReportAccountSession();
  return props.open ? <UploadForm key={`${session.uid}:${session.epoch}`} {...props} /> : null;
}
function UploadForm({ open, onClose, onPublished }: Props) {
  const [file, setFile] = useState<File | null>(null), [title, setTitle] = useState(''), [tags, setTags] = useState(''), [consent, setConsent] = useState(false), [fileError, setFileError] = useState('');
  const picker = useRef<HTMLInputElement>(null), live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const { uploadSound, cancelUpload, isUploading, progress, stage, error } = useUploadSound();
  const close = () => { live.current = false; void cancelUpload(); onClose(); };
  const publish = async () => {
    if (!file || !title.trim() || !consent) return;
    const result = await uploadSound({ file, title: title.trim(), tags: tags.split(',').map(value => value.trim()).filter(Boolean), publicConsent: consent });
    if (result && live.current) { onPublished?.(result.soundId!); onClose(); }
  };
  return <Sheet open={open} onOpenChange={next => { if (!next) close(); }}><SheetContent side="bottom"><SheetHeader>
    <SheetTitle>Publish an original sound</SheetTitle><SheetDescription>Anyone can listen to a published sound. Upload only audio you created or have permission to share.</SheetDescription>
  </SheetHeader><div className="space-y-4 pt-4">
    <input ref={picker} aria-label="Audio file" type="file" accept=".mp3,.wav,.ogg,.aac,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/aac,audio/mp4" className="sr-only" disabled={isUploading} onChange={event => {
      const selected = event.target.files?.[0]; if (!selected) return;
      if (!soundContentType(selected) || selected.size < 16 || selected.size > 20 * 1024 * 1024) { setFileError('Choose MP3, WAV, OGG, AAC or M4A audio up to 20 MiB.'); return; }
      setFile(selected); setFileError(''); if (!title) setTitle(selected.name.replace(/\.[^.]+$/, '').slice(0, 100));
    }} />
    <Button variant="outline" className="w-full" disabled={isUploading} onClick={() => picker.current?.click()}>{file ? 'Change audio file' : 'Choose audio file'}</Button>
    {file && <div className="flex items-center gap-2"><p className="flex-1 break-all text-sm">{file.name} · {(file.size / 1048576).toFixed(1)} MiB</p><Button size="icon" variant="ghost" aria-label="Remove selected audio" disabled={isUploading} onClick={() => { setFile(null); if (picker.current) picker.current.value = ''; }}><X className="h-4 w-4" /></Button></div>}
    <p className="text-xs text-muted-foreground">0.1–60 seconds · MP3, WAV, OGG, AAC, M4A · Maximum 20 MiB. The server checks the actual audio; this is not a content or copyright review.</p>
    <label className="block text-sm">Title<Input value={title} maxLength={100} disabled={isUploading} onChange={event => setTitle(event.target.value)} /></label>
    <label className="block text-sm">Tags<Input value={tags} maxLength={310} disabled={isUploading} placeholder="Up to 10 tags, separated by commas" onChange={event => setTags(event.target.value)} /></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} disabled={isUploading} onChange={event => setConsent(event.target.checked)} />I have the right to share this audio and want to publish it for everyone to listen.</label>
    {(fileError || error) && <p role="alert" className="text-sm">{fileError || error}</p>}
    {isUploading && <div><Progress value={progress} /><p role="status" className="text-sm mt-2">{stage}</p><Button variant="outline" onClick={() => void cancelUpload()}>Cancel upload</Button></div>}
    <Button className="w-full" disabled={!file || !title.trim() || !consent || isUploading} onClick={() => void publish()}><Upload className="h-4 w-4 mr-2" />{isUploading ? 'Publishing…' : 'Publish sound'}</Button>
    <p className="text-xs text-muted-foreground">Publishing does not add XP. Adding this audio to video exports is not available yet.</p>
  </div></SheetContent></Sheet>;
}
