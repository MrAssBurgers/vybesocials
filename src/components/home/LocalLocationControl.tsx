import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useApproximateLocation } from '@/hooks/useApproximateLocation';

export function LocalLocationControl({ location: control }: { location: ReturnType<typeof useApproximateLocation> }) {
  return <section aria-label="Local area" className="rounded-[2rem] bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 space-y-4">
    <div className="flex items-center gap-3"><span className="rounded-full bg-primary/10 p-3"><MapPin className="h-5 w-5 text-primary" /></span>
      <div><h2 className="font-semibold">A little closer to home</h2><p className="text-sm text-muted-foreground">Discover moments shared around you.</p></div></div>
    <p className="text-sm text-muted-foreground">{control.location ? 'Showing posts shared within about 25 miles of your approximate area.' : 'Choose your approximate area to see nearby posts. Your precise location stays on your device.'} Post audiences still apply.</p>
    <p className="text-xs text-muted-foreground">Your search area clears from this screen when you leave Local or hide the app.</p>
    {control.error && <p role="alert" className="text-sm text-destructive">{control.error}</p>}
    <div className="flex flex-wrap gap-2"><Button className="rounded-full" disabled={control.pending} onClick={control.requestLocation}>{control.pending ? 'Finding your area…' : control.location ? 'Update approximate area' : 'Use approximate location'}</Button>
      {control.location && <Button variant="ghost" className="rounded-full" onClick={control.clearLocation}>Clear area</Button>}</div>
    <p className="text-xs text-muted-foreground">To share a moment here, open your post’s options and choose Local sharing.</p>
  </section>;
}
