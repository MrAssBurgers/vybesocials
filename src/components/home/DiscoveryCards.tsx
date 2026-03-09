import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dna, Wallet, ShoppingBag, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface DiscoveryItem {
  icon: React.ReactNode;
  label: string;
  path: string;
  gradient: string;
}

const items: DiscoveryItem[] = [
  { icon: <Dna className="h-5 w-5" />, label: 'VYBE DNA', path: '/vybe-dna', gradient: 'from-violet-500/20 to-fuchsia-500/20' },
  { icon: <Wallet className="h-5 w-5" />, label: 'Wallet', path: '/wallet', gradient: 'from-amber-500/20 to-orange-500/20' },
  { icon: <ShoppingBag className="h-5 w-5" />, label: 'Shop', path: '/marketplace', gradient: 'from-emerald-500/20 to-teal-500/20' },
  { icon: <Radio className="h-5 w-5" />, label: 'Spaces', path: '/spaces', gradient: 'from-blue-500/20 to-cyan-500/20' },
];

export const DiscoveryCards = memo(function DiscoveryCards() {
  const navigate = useNavigate();

  return (
    <div className="px-4 pb-3">
      <div className="grid grid-cols-4 gap-2">
        {items.map(item => (
          <button
            key={item.path}
            onClick={() => { triggerHaptic('light'); navigate(item.path); }}
            className={cn(
              "flex flex-col items-center gap-1.5 py-3 rounded-xl transition-all",
              "bg-gradient-to-br border border-white/10 hover:scale-[1.04] active:scale-95",
              item.gradient
            )}
          >
            <span className="text-foreground">{item.icon}</span>
            <span className="text-[11px] font-medium text-foreground/80">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
