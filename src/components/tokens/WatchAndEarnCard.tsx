import { Card } from '@/components/ui/card';
import { Play } from 'lucide-react';
export function WatchAndEarnCard() {
  return <Card className="p-5 space-y-2"><h2 className="font-semibold flex items-center gap-2"><Play className="h-4 w-4" />Watch & Earn</h2>
    <p className="text-sm text-muted-foreground">Ad rewards are currently unavailable. Verified provider rewards must be connected before you can earn tokens from ads.</p>
    <button className="text-sm text-muted-foreground" disabled>Unavailable</button></Card>;
}
