interface PaywallSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Paywall sheet — temporarily disabled while VYBE+ is being built.
 * Every feature is free for now, so this never opens.
 */
export function PaywallSheet(_props: PaywallSheetProps) {
  return null;
}
