/**
 * JoinSpaceSheet - Bottom sheet for joining a VYBE Space
 * Mobile-first design
 */

import { useState } from 'react';
import { 
  Link2, 
  ArrowRight,
  Sparkles,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useJoinServer } from '@/hooks/useServers';

interface JoinSpaceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinSpaceSheet({ open, onOpenChange }: JoinSpaceSheetProps) {
  const [inviteCode, setInviteCode] = useState('');
  const joinServer = useJoinServer();

  const handleJoin = async () => {
    if (!inviteCode.trim() || joinServer.isPending) return;

    try {
      await joinServer.mutateAsync(inviteCode.trim());
      onOpenChange(false);
      setInviteCode('');
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto rounded-t-3xl px-0">
        <SheetHeader className="px-6 pb-4 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
              <Link2 className="h-4 w-4 text-white" />
            </div>
            Join a Space
          </SheetTitle>
        </SheetHeader>

        <div className="px-6 py-6 space-y-6">
          {/* Illustration */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Users className="h-10 w-10 text-primary" />
              </div>
              <div className="absolute -bottom-2 -right-2 h-8 w-8 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-center text-muted-foreground text-sm">
            Enter an invite code to join an existing space and connect with your community
          </p>

          {/* Invite code input */}
          <div className="space-y-2">
            <Label htmlFor="invite-code" className="text-sm font-medium">
              Invite Code
            </Label>
            <Input
              id="invite-code"
              placeholder="e.g., vybe-abc123"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="h-12 rounded-xl bg-muted/50 border-0 font-mono text-base tracking-wider"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <p className="text-xs text-muted-foreground">
              Invite codes are shared by Space owners or moderators
            </p>
          </div>

          {/* Join button */}
          <Button
            className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90 transition-opacity"
            disabled={!inviteCode.trim() || joinServer.isPending}
            onClick={handleJoin}
          >
            {joinServer.isPending ? (
              'Joining...'
            ) : (
              <>
                Join Space
                <ArrowRight className="h-5 w-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
