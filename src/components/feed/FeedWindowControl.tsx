import { Button } from '@/components/ui/button';

/** Moving the retained window is deliberate so a background refresh cannot
 * remove rows above the user's current scroll position. */
export function FeedWindowControl({ onContinue, onNewer, onRestart, disabled = false }: { onContinue?: () => void; onNewer?: () => void; onRestart?: () => void; disabled?: boolean }) {
  return <div className="py-5 text-center space-y-2">
    {onNewer && <Button variant="ghost" className="rounded-full" disabled={disabled} onClick={onNewer}>Newer posts</Button>}
    {onContinue && <><Button variant="secondary" className="rounded-full" disabled={disabled} onClick={onContinue}>Continue to older posts</Button>
    <p className="text-xs text-muted-foreground">Replaces the posts in this group.</p></>}
    {onRestart && <Button variant="ghost" className="rounded-full" disabled={disabled} onClick={onRestart}>Back to newest posts</Button>}
  </div>;
}
