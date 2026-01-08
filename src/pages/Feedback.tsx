import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquarePlus, ThumbsUp, Bug, Lightbulb, Sparkles, MoreHorizontal, Filter } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFeedback, useCreateFeedback, useLikeFeedback, useUpdateFeedbackStatus, Feedback } from '@/hooks/useFeedback';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useModeration';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const typeIcons = {
  bug: Bug,
  feature: Lightbulb,
  improvement: Sparkles,
  other: MessageSquarePlus,
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
  const TypeIcon = typeIcons[feedback.type] || MessageSquarePlus;

  const handleLike = () => {
    if (!profile) return;
    likeFeedback.mutate({ feedbackId: feedback.id, unlike: feedback.has_liked });
  };

  const handleStatusChange = (status: string) => {
    updateStatus.mutate({ id: feedback.id, status });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      layout
    >
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={feedback.user?.avatar_url || undefined} />
                <AvatarFallback>
                  {feedback.user?.username?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
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
                <TypeIcon className="h-3 w-3 mr-1" />
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
                    <DropdownMenuItem onClick={() => handleStatusChange('open')}>
                      Mark as Open
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStatusChange('in_progress')}>
                      Mark as In Progress
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStatusChange('resolved')}>
                      Mark as Resolved
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStatusChange('closed')}>
                      Mark as Closed
                    </DropdownMenuItem>
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
              className={cn(
                'gap-2',
                feedback.has_liked && 'text-primary'
              )}
            >
              <ThumbsUp className={cn('h-4 w-4', feedback.has_liked && 'fill-current')} />
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
        <Button className="gap-2">
          <MessageSquarePlus className="h-4 w-4" />
          Submit Feedback
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit Feedback</DialogTitle>
          <DialogDescription>
            Help us improve by sharing your thoughts, reporting bugs, or suggesting features.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Select feedback type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">🐛 Bug Report</SelectItem>
                <SelectItem value="feature">💡 Feature Request</SelectItem>
                <SelectItem value="improvement">✨ Improvement</SelectItem>
                <SelectItem value="other">💬 Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea
              placeholder="Describe your feedback..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/1000
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!type || !message.trim() || createFeedback.isPending}
          >
            {createFeedback.isPending ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Feedback</h1>
              <p className="text-muted-foreground">
                Community suggestions and bug reports
              </p>
            </div>
            <NewFeedbackDialog />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bug">🐛 Bugs</SelectItem>
                <SelectItem value="feature">💡 Features</SelectItem>
                <SelectItem value="improvement">✨ Improvements</SelectItem>
                <SelectItem value="other">💬 Other</SelectItem>
              </SelectContent>
            </Select>
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
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquarePlus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No feedback yet</h3>
              <p className="text-muted-foreground mb-4">
                Be the first to share your thoughts!
              </p>
              <NewFeedbackDialog />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
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
