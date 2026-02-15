import { useState } from 'react';
import { Crown } from 'lucide-react';
import { Button, ButtonProps } from '@/components/ui/button';
import { PaywallSheet } from './PaywallSheet';
import { cn } from '@/lib/utils';

interface UpgradeButtonProps extends Omit<ButtonProps, 'onClick'> {
  label?: string;
}

export function UpgradeButton({ label = 'Upgrade', className, ...props }: UpgradeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className={cn("gap-1.5", className)}
        {...props}
      >
        <Crown className="h-4 w-4" />
        {label}
      </Button>
      <PaywallSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
