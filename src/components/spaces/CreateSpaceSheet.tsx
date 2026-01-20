/**
 * CreateSpaceSheet - Bottom sheet for creating a new VYBE Space
 * Mobile-first design with simple form
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Camera, 
  Globe, 
  Lock,
  Sparkles,
  Users,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useCreateServer } from '@/hooks/useServers';

interface CreateSpaceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSpaceSheet({ open, onOpenChange }: CreateSpaceSheetProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const createServer = useCreateServer();

  const handleCreate = async () => {
    if (!name.trim() || createServer.isPending) return;

    try {
      await createServer.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
      });
      onOpenChange(false);
      setName('');
      setDescription('');
      setIsPublic(true);
    } catch (error) {
      // Error handled by mutation
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl px-0">
        <SheetHeader className="px-6 pb-4 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            Create a Space
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Icon upload placeholder */}
          <div className="flex justify-center">
            <button className="relative group">
              <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center border-2 border-dashed border-primary/30 transition-all group-hover:border-primary/60">
                <Camera className="h-8 w-8 text-primary/60 group-hover:text-primary transition-colors" />
              </div>
              <div className="absolute inset-0 rounded-3xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-medium">Upload Icon</span>
              </div>
            </button>
          </div>

          {/* Space name */}
          <div className="space-y-2">
            <Label htmlFor="space-name" className="text-sm font-medium">
              Space Name
            </Label>
            <Input
              id="space-name"
              placeholder="Give your space a name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-xl bg-muted/50 border-0 text-base"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="space-description" className="text-sm font-medium">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="space-description"
              placeholder="What's your space about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px] rounded-xl bg-muted/50 border-0 resize-none text-base"
            />
          </div>

          {/* Visibility toggle */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Visibility</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setIsPublic(true)}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                  isPublic
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted/30 hover:border-muted-foreground/30"
                )}
              >
                <div className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center",
                  isPublic ? "bg-primary/20" : "bg-muted"
                )}>
                  <Globe className={cn(
                    "h-6 w-6",
                    isPublic ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm">Public</p>
                  <p className="text-xs text-muted-foreground">Anyone can join</p>
                </div>
              </button>

              <button
                onClick={() => setIsPublic(false)}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                  !isPublic
                    ? "border-primary bg-primary/10"
                    : "border-border bg-muted/30 hover:border-muted-foreground/30"
                )}
              >
                <div className={cn(
                  "h-12 w-12 rounded-xl flex items-center justify-center",
                  !isPublic ? "bg-primary/20" : "bg-muted"
                )}>
                  <Lock className={cn(
                    "h-6 w-6",
                    !isPublic ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div className="text-center">
                  <p className="font-medium text-sm">Private</p>
                  <p className="text-xs text-muted-foreground">Invite only</p>
                </div>
              </button>
            </div>
          </div>

          {/* Info card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/20">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Build your community</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Create a space to bring people together around shared interests, projects, or just good vibes.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 bg-background">
          <Button
            className="w-full h-12 rounded-xl text-base font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
            disabled={!name.trim() || createServer.isPending}
            onClick={handleCreate}
          >
            {createServer.isPending ? (
              'Creating...'
            ) : (
              <>
                Create Space
                <ArrowRight className="h-5 w-5 ml-2" />
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
