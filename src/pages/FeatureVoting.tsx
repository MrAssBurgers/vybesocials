import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, Plus, Rocket, CheckCircle2, Clock, Sparkles } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useFeatureRequests, useMyFeatureVotes, useToggleFeatureVote, useSubmitFeatureRequest } from '@/hooks/useGrowth';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  open: { label: 'Open', icon: Clock, color: 'text-blue-400' },
  planned: { label: 'Planned', icon: Rocket, color: 'text-amber-400' },
  in_progress: { label: 'Building', icon: Sparkles, color: 'text-primary' },
  shipped: { label: 'Shipped', icon: CheckCircle2, color: 'text-green-400' },
};

export default function FeatureVoting() {
  const { user } = useAuth();
  const { data: features = [], isLoading } = useFeatureRequests();
  const { data: myVotes = new Set() } = useMyFeatureVotes();
  const toggleVote = useToggleFeatureVote();
  const submitFeature = useSubmitFeatureRequest();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const handleVote = (featureId: string) => {
    if (!user) return toast.error('Sign in to vote');
    toggleVote.mutate({ featureId, isVoted: myVotes.has(featureId) });
  };

  const handleSubmit = async () => {
    if (!title.trim()) return toast.error('Title is required');
    try {
      await submitFeature.mutateAsync({ title: title.trim(), description: description.trim() || undefined });
      setTitle('');
      setDescription('');
      setShowForm(false);
      toast.success('Feature request submitted!');
    } catch {
      toast.error('Failed to submit');
    }
  };

  const filtered = filter === 'all' ? features : features.filter(f => f.status === filter);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-animated mb-4">
            <Rocket className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Build VYBE Together</h1>
          <p className="text-muted-foreground">Vote on features. Top voted ships next.</p>
        </motion.div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {['all', 'open', 'planned', 'in_progress', 'shipped'].map(s => (
            <Button
              key={s}
              variant={filter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(s)}
              className="shrink-0 rounded-full"
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label || s}
            </Button>
          ))}
        </div>

        {/* Submit new */}
        <AnimatePresence>
          {showForm ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="liquid-glass-card rounded-2xl p-5 space-y-3"
            >
              <Input
                placeholder="Feature title..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="rounded-xl"
              />
              <Textarea
                placeholder="Describe it (optional)..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                className="rounded-xl"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)} className="flex-1 rounded-xl">
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={submitFeature.isPending} className="flex-1 gradient-animated rounded-xl">
                  Submit
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Button onClick={() => setShowForm(true)} variant="outline" className="w-full rounded-xl gap-2">
                <Plus className="h-4 w-4" /> Suggest a Feature
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feature list */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="liquid-glass-card rounded-2xl p-5 h-24 animate-pulse" />
            ))
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Rocket className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No features yet. Be the first to suggest one!</p>
            </div>
          ) : (
            filtered.map((feature, i) => {
              const isVoted = myVotes.has(feature.id);
              const statusConf = STATUS_CONFIG[feature.status] || STATUS_CONFIG.open;
              const StatusIcon = statusConf.icon;

              return (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="liquid-glass-card rounded-2xl p-5 flex gap-4"
                >
                  {/* Vote button */}
                  <button
                    onClick={() => handleVote(feature.id)}
                    className={`flex flex-col items-center gap-0.5 shrink-0 transition-all ${
                      isVoted ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ChevronUp className={`h-5 w-5 transition-transform ${isVoted ? 'scale-125' : ''}`} />
                    <span className="text-sm font-bold">{feature.vote_count}</span>
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">{feature.title}</h3>
                      <Badge variant="outline" className={`text-[10px] shrink-0 gap-1 ${statusConf.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConf.label}
                      </Badge>
                    </div>
                    {feature.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{feature.description}</p>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </AppLayout>
  );
}
