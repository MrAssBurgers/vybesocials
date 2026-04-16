import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Sparkles, Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface FilterUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FILTER_CATEGORIES = [
  { id: 'face', label: '🎭 Face', value: 'face' },
  { id: 'world', label: '🌍 World', value: 'world' },
  { id: 'color', label: '🎨 Color', value: 'color' },
  { id: 'fun', label: '✨ Fun', value: 'fun' },
];

export function FilterUploadModal({ isOpen, onClose }: FilterUploadModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lensId, setLensId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [category, setCategory] = useState('face');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user || !name.trim() || !lensId.trim() || !groupId.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('filters').insert({
        creator_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
        css_filter: 'none',
        category,
        effect_config: {
          snapLensId: lensId.trim(),
          snapGroupId: groupId.trim(),
          type: 'snap_lens',
        },
        is_published: true,
        is_approved: false, // Requires moderation
      });

      if (error) throw error;

      toast.success('Filter submitted for review! 🎉');
      triggerHaptic('success');
      resetForm();
      onClose();
    } catch (err) {
      console.error('[FilterUpload] Error:', err);
      toast.error('Failed to upload filter');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setLensId('');
    setGroupId('');
    setCategory('face');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full max-w-lg bg-card rounded-t-3xl p-6 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Upload Snap Lens</h2>
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Info */}
            <div className="bg-primary/10 rounded-2xl p-4 mb-6">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary">Create with Snap Lens Studio</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Build your filter in{' '}
                    <a href="https://lensstudio.snapchat.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      Snap Lens Studio
                    </a>
                    , then paste your Lens ID and Group ID here.
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Filter Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome Filter"
                  className="rounded-xl"
                  maxLength={50}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Description</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does your filter do?"
                  className="rounded-xl"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Snap Lens ID *</label>
                <Input
                  value={lensId}
                  onChange={(e) => setLensId(e.target.value)}
                  placeholder="e.g. 1234-5678-abcd-efgh"
                  className="rounded-xl font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Snap Group ID *</label>
                <Input
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  placeholder="e.g. abcd-1234-efgh-5678"
                  className="rounded-xl font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Category</label>
                <div className="flex gap-2 flex-wrap">
                  {FILTER_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategory(cat.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-sm font-medium transition-all",
                        category === cat.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="mt-6 flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !name.trim() || !lensId.trim() || !groupId.trim()}
                className="flex-1 rounded-xl bg-primary"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-1.5" />
                    Submit for Review
                  </>
                )}
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center mt-3">
              Submitted filters are reviewed before going live
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
