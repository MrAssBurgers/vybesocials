import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useSpaces, useCreateSpace, Space } from '@/hooks/useSpaces';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Plus, Users, Mic, MicOff, ArrowLeft, Sparkles, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

function SpaceCard({ space, onClick }: { space: Space; onClick: () => void }) {
  const isLive = space.status === 'live';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "rounded-2xl p-4 border cursor-pointer transition-all",
        isLive 
          ? "border-primary/50 bg-gradient-to-br from-primary/10 to-accent/10" 
          : "border-border/50 bg-card/50"
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 ring-2 ring-primary/30">
          <AvatarImage src={space.host?.avatar_url || undefined} />
          <AvatarFallback>{space.host?.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isLive && (
              <Badge variant="destructive" className="text-[10px] animate-pulse">
                <Radio className="h-2.5 w-2.5 mr-1" /> LIVE
              </Badge>
            )}
            {!isLive && (
              <Badge variant="secondary" className="text-[10px]">
                <Calendar className="h-2.5 w-2.5 mr-1" /> Scheduled
              </Badge>
            )}
          </div>
          
          <h3 className="font-semibold text-sm truncate">{space.title}</h3>
          <p className="text-xs text-muted-foreground truncate">
            @{space.host?.username}
          </p>
          
          {space.tags && space.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {space.tags.slice(0, 3).map(tag => (
                <Badge key={tag} variant="outline" className="text-[9px] py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{space.listener_count}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CreateSpaceDialog({ onCreated }: { onCreated: (space: Space) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const createSpace = useCreateSpace();

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      const space = await createSpace.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      toast.success('Space created! You\'re live 🎙️');
      setOpen(false);
      setTitle('');
      setDescription('');
      setTags('');
      onCreated(space);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create space');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full gap-2 bg-gradient-to-r from-primary to-accent">
          <Plus className="h-4 w-4" />
          Start a Space
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Start a Live Space
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 pt-2">
          <Input
            placeholder="What's the vibe?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl"
          />
          
          <Textarea
            placeholder="Tell people what you'll be talking about..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="rounded-xl resize-none"
          />
          
          <Input
            placeholder="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="rounded-xl"
          />
          
          <Button 
            onClick={handleCreate} 
            disabled={createSpace.isPending}
            className="w-full rounded-xl gap-2"
          >
            {createSpace.isPending ? 'Going live...' : 'Go Live 🎙️'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VYBESpaces() {
  const navigate = useNavigate();
  const { data: spaces = [], isLoading } = useSpaces();
  
  const liveSpaces = spaces.filter(s => s.status === 'live');
  const scheduledSpaces = spaces.filter(s => s.status === 'scheduled');

  const handleSpaceClick = (space: Space) => {
    navigate(`/space/${space.id}`);
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Radio className="h-6 w-6 text-primary" />
                VYBE Hubs
              </h1>
              <p className="text-sm text-muted-foreground">
                Live audio rooms with your people
              </p>
            </div>
          </div>
          
          <CreateSpaceDialog onCreated={handleSpaceClick} />
        </div>

        {/* Live Spaces */}
        {liveSpaces.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Live Now
            </h2>
            <div className="space-y-2">
              {liveSpaces.map(space => (
                <SpaceCard key={space.id} space={space} onClick={() => handleSpaceClick(space)} />
              ))}
            </div>
          </div>
        )}

        {/* Scheduled Spaces */}
        {scheduledSpaces.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Coming Up
            </h2>
            <div className="space-y-2">
              {scheduledSpaces.map(space => (
                <SpaceCard key={space.id} space={space} onClick={() => handleSpaceClick(space)} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && spaces.length === 0 && (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-16"
          >
            <Radio className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No spaces yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Be the first to start a live audio space!
            </p>
            <CreateSpaceDialog onCreated={handleSpaceClick} />
          </motion.div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
