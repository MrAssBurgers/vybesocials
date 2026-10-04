import { Clapperboard, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ClipsEmptyState({
  title = 'Your next favorite clip is on its way',
  description = 'Make the first move. Share a moment, a game highlight, or something worth replaying.',
  actionLabel = 'Create a clip',
  onAction,
  onBrowseVideos,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction: () => void;
  onBrowseVideos: () => void;
}) {
  return <section className="clips-empty-state" aria-label="No clips available">
    <div className="clips-empty-art" aria-hidden="true">
      <div className="clips-empty-orbit" />
      <div className="clips-empty-icon"><Clapperboard size={36} strokeWidth={1.5} /></div>
      <span className="clips-empty-spark clips-empty-spark--one" />
      <span className="clips-empty-spark clips-empty-spark--two" />
    </div>
    <p className="clips-empty-eyebrow">A LITTLE QUIET HERE</p>
    <h1>{title}</h1>
    <p className="clips-empty-description">{description}</p>
    <Button variant="vybeLiquid" size="lg" className="clips-empty-create" onClick={onAction}>
      <Plus className="h-4 w-4" />{actionLabel}
    </Button>
    <button type="button" className="clips-empty-browse" onClick={onBrowseVideos}>
      Browse videos <ArrowRight size={15} />
    </button>
  </section>;
}
