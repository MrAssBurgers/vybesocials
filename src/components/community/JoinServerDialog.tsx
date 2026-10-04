import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useJoinServer } from '@/hooks/useServers';

interface JoinServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode?: string;
  onJoined?: (serverId: string) => void;
}

export function JoinServerDialog({ open, onOpenChange, initialCode = '', onJoined }: JoinServerDialogProps) {
  const [inviteCode, setInviteCode] = useState('');
  const joinServer = useJoinServer();
  useEffect(() => { if (open && initialCode) setInviteCode(initialCode); }, [open, initialCode]);

  const handleJoin = async () => {
    if (!inviteCode.trim() || joinServer.isPending) return;

    try {
      const server = await joinServer.mutateAsync(inviteCode.trim());
      onJoined?.(server.id);
      onOpenChange(false);
      setInviteCode('');
    } catch (error) {
      // Error handled by mutation
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
        onClick={() => onOpenChange(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-md mx-4 bg-card rounded-2xl shadow-xl border border-border overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Join a Server</h2>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Link2 className="h-10 w-10 text-primary" />
              </div>
            </div>

            {/* Description */}
            <div className="text-center">
              <p className="text-muted-foreground">
                Enter a current invitation code or VYBE link to join a community
              </p>
            </div>

            {/* Invite code input */}
            <div className="space-y-2">
              <Label htmlFor="invite-code">Invite Code</Label>
              <Input
                id="invite-code"
                placeholder="Paste an invitation code or link"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="h-12 font-mono"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              />
            </div>

            {/* Join button */}
            <Button
              className="w-full h-12"
              disabled={!inviteCode.trim() || joinServer.isPending}
              onClick={handleJoin}
            >
              {joinServer.isPending ? (
                'Joining...'
              ) : (
                <>
                  Join Server
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>

            {/* Help text */}
            <p className="text-xs text-center text-muted-foreground">
              Invite codes are usually shared by server members or admins
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
