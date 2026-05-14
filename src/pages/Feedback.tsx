import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, ThumbsUp, Bug, Lightbulb, MoreHorizontal, Filter, Sparkles } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFeedback, useCreateFeedback, useLikeFeedback, useUpdateFeedbackStatus, Feedback } from '@/hooks/useFeedback';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useModeration';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const typeIcons: Record<string, React.ComponentType<{ className?: string }> | null> = {
  bug: Bug,
  feature: Lightbulb,
  improvement: null,
  other: MessageSquarePlus,
};

const typeAccents = {
  bug: 'border-l-red-500/60',
  feature: 'border-l-blue-500/60',
  improvement: 'border-l-green-500/60',
  other: 'border-l-muted-foreground/30',
};

const typeColors = {
  bug: 'text-red-500 bg-red-500/10',
  feature: 'text-blue-500 bg-blue-500/10',
  improvement: 'text-green-500 bg-green-500/10',
  other: 'text-muted-foreground bg-muted',
};

const statusColors = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-yellow-500/20 text-yellow-600',
  resolved: 'bg-green-500/20 text-green-600',
  closed: 'bg-gray-500/20 text-gray-500',
};

function FeedbackCard({ feedback }: { feedback: Feedback }) {
  const { profile } = useAuth();
  const { data: role } = useUserRole();
  const likeFeedback = useLikeFeedback();
  const updateStatus = useUpdateFeedbackStatus();

  const isAdmin = role === 'admin' || role === 'moderator';
  const TypeIcon = typeIcons[feedback.type];
  const isImprovement = feedback.type === 'improvement';

  const handleLike = () => {
    if (!profile) return;
    likeFeedback.mutate({ feedbackId: feedback.id, unlike: feedback.has_liked });
  };

  const handleStatusChange = (status: string) => {
    updateStatus.mutate({ id: feedback.id, status });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      <Card className={cn(
        'overflow-hidden hover:shadow-md transition-all border-l-[3px]',
        typeAccents[feedback.type as keyof typeof typeAccents] || typeAccents.other
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={feedback.user?.avatar_url || undefined} />
                <AvatarFallback>{feedback.user?.username?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{feedback.user?.username || 'Anonymous'}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(feedback.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={cn('text-xs', typeColors[feedback.type])}>
                {isImprovement ? (
                  <VybeMiniIcon size={12} showSparkles className="mr-1" />
                ) : TypeIcon ? (
                  <TypeIcon className="h-3 w-3 mr-1" />
                ) : (
                  <MessageSquarePlus className="h-3 w-3 mr-1" />
                )}
                {feedback.type}
              </Badge>
              <Badge variant="secondary" className={cn('text-xs', statusColors[feedback.status])}>
                {feedback.status.replace('_', ' ')}
              </Badge>
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleStatusChange('open')}>Mark as Open</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStatusChange('in_progress')}>Mark as In Progress</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStatusChange('resolved')}>Mark as Resolved</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStatusChange('closed')}>Mark as Closed</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm whitespace-pre-wrap">{feedback.message}</p>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              disabled={!profile || likeFeedback.isPending}
              className={cn('gap-2 group', feedback.has_liked && 'text-primary')}
            >
              <motion.div whileTap={{ scale: 1.3 }} transition={{ type: 'spring', stiffness: 500 }}>
                <ThumbsUp className={cn('h-4 w-4 transition-all', feedback.has_liked && 'fill-current')} />
              </motion.div>
              <span>{feedback.likes_count}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function NewFeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>('');
  const [message, setMessage] = useState('');
  const createFeedback = useCreateFeedback();

  const handleSubmit = async () => {
    if (!message.trim() || !type) return;
    await createFeedback.mutateAsync({ type, message });
    setOpen(false);
    setMessage('');
    setType('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-sm px-3 py-1.5 h-8">
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Submit
        </Button>
      </DialogTrigger>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Share Feedback</DialogTitle>
          <DialogDescription>
            Found a bug, have an idea, or want to suggest an improvement? Tell us — we read every submission.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>What kind of feedback?</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">🐛 Report a bug</SelectItem>
                <SelectItem value="feature">💡 Request a feature</SelectItem>
                <SelectItem value="improvement">✨ Suggest an improvement</SelectItem>
                <SelectItem value="other">💬 Something else</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tell us more</Label>
            <Textarea
              placeholder={
                type === 'bug'
                  ? 'What happened? What did you expect? Steps to reproduce help us fix it faster.'
                  : type === 'feature'
                  ? 'What would you love to see in VYBE, and how would you use it?'
                  : 'Share your thoughts...'
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">{message.length}/1000</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!type || !message.trim() || createFeedback.isPending}>
            {createFeedback.isPending ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All', icon: null },
  { value: 'bug', label: 'Bugs', icon: Bug },
  { value: 'feature', label: 'Features', icon: Lightbulb },
  { value: 'improvement', label: 'Improvements', icon: Sparkles },
];

export default function FeedbackPage() {
  const { data: feedback, isLoading } = useFeedback();
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredFeedback = feedback?.filter((f) => {
    if (typeFilter === 'all') return true;
    return f.type === typeFilter;
  });

  return (
    <AppLayout>
      <div className="p-4 max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          {/* Header with gradient icon */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 blur-sm" />
                <div className="relative w-10 h-10 rounded-xl bg-card/80 backdrop-blur-sm border border-border/30 flex items-center justify-center">
                  <MessageSquarePlus className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Feedback</h1>
                <p className="text-xs text-muted-foreground">Community voice board</p>
              </div>
            </div>
            <NewFeedbackDialog />
          </div>

          {/* Gradient accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent mb-4" />

          {/* Capsule Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTypeFilter(opt.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0',
                  typeFilter === opt.value
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'bg-card/60 text-muted-foreground hover:text-foreground border border-border/40'
                )}
              >
                {opt.icon && <opt.icon className="h-3 w-3" />}
                {opt.label}
              </button>
            ))}
          </div>
        </motion.div>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredFeedback?.length === 0 ? (
          <div className="py-16 text-center">
            <div className="relative inline-block mb-4">
              <div className="absolute -inset-4 rounded-2xl bg-gradient-to-br from-primary/5 to-accent/5" />
              <div className="relative w-16 h-16 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/30 flex items-center justify-center">
                <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.5 }}>
                  <MessageSquarePlus className="h-7 w-7 text-muted-foreground/50" />
                </motion.div>
              </div>
            </div>
            <h3 className="text-sm font-medium mb-1">No feedback yet</h3>
            <p className="text-xs text-muted-foreground mb-4">Be the first to share your thoughts!</p>
            <NewFeedbackDialog />
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredFeedback?.map((f) => (
                <FeedbackCard key={f.id} feedback={f} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
