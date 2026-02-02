import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Send, X, Sparkles, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

interface AIBriefCustomizeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPreferencesUpdated: () => void;
}

interface Preferences {
  custom_topics: string[];
  excluded_topics: string[];
  show_images: boolean;
  brief_style: string;
}

const SUGGESTED_TOPICS = [
  'Breaking News', 'Stock Market', 'Crypto', 'AI News', 'Space',
  'Climate', 'Pop Culture', 'Sports Scores', 'Movie Reviews', 'Recipes',
  'Workout Tips', 'Travel Deals', 'Tech Reviews', 'Gaming News', 'Music Releases'
];

export function AIBriefCustomizeSheet({ open, onOpenChange, onPreferencesUpdated }: AIBriefCustomizeSheetProps) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>({
    custom_topics: [],
    excluded_topics: [],
    show_images: true,
    brief_style: 'detailed'
  });
  const [newTopic, setNewTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadPreferences();
    }
  }, [open, user]);

  const loadPreferences = async () => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      // First get the profile ID for this auth user
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('ai_brief_preferences')
        .select('*')
        .eq('user_id', profile.id)
        .single();

      if (data) {
        setPreferences({
          custom_topics: data.custom_topics || [],
          excluded_topics: data.excluded_topics || [],
          show_images: data.show_images ?? true,
          brief_style: data.brief_style || 'detailed'
        });
      }
    } catch (error) {
      // No preferences yet, use defaults
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async () => {
    if (!user) return;
    setIsSaving(true);
    haptics.tap();

    try {
      // Get profile ID for this auth user
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) {
        toast.error('Profile not found');
        return;
      }

      const { error } = await supabase
        .from('ai_brief_preferences')
        .upsert({
          user_id: profile.id,
          custom_topics: preferences.custom_topics,
          excluded_topics: preferences.excluded_topics,
          show_images: preferences.show_images,
          brief_style: preferences.brief_style,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      toast.success('Preferences saved!');
      haptics.success();
      onPreferencesUpdated();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const addTopic = (topic: string) => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) return;
    
    // Check if topic already exists (case-insensitive)
    const exists = preferences.custom_topics.some(
      t => t.toLowerCase() === trimmedTopic.toLowerCase()
    );
    if (exists) {
      toast.info('Topic already added');
      return;
    }
    
    setPreferences(prev => ({
      ...prev,
      custom_topics: [...prev.custom_topics, trimmedTopic]
    }));
    setNewTopic('');
    haptics.tap();
  };

  const removeTopic = (topic: string) => {
    setPreferences(prev => ({
      ...prev,
      custom_topics: prev.custom_topics.filter(t => t !== topic)
    }));
    haptics.tap();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="bottom" 
        className="h-[80vh] rounded-t-3xl flex flex-col overflow-hidden bg-background"
      >
        <SheetHeader className="flex-shrink-0 pb-3 border-b border-border/50">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Customize Your Brief
          </SheetTitle>
        </SheetHeader>

        {/* Scrollable Content */}
        <div 
          className="flex-1 overflow-y-auto overscroll-contain py-4"
          style={{ minHeight: 0 }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Add custom topics */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Add topics you want to follow</Label>
                <div className="flex gap-2">
                  <Input
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    placeholder="e.g., Electric vehicles, NBA..."
                    className="flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && addTopic(newTopic)}
                  />
                  <Button 
                    size="icon" 
                    onClick={() => addTopic(newTopic)}
                    disabled={!newTopic.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Current topics */}
                {preferences.custom_topics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {preferences.custom_topics.map((topic) => (
                      <Badge 
                        key={topic} 
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {topic}
                        <button
                          onClick={() => removeTopic(topic)}
                          className="ml-1 p-0.5 hover:bg-foreground/10 rounded"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Suggested topics */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Quick add suggestions</Label>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_TOPICS.filter(t => !preferences.custom_topics.includes(t)).slice(0, 10).map((topic) => (
                    <Badge 
                      key={topic}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() => addTopic(topic)}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Show images</Label>
                    <p className="text-xs text-muted-foreground">Display relevant images with updates</p>
                  </div>
                  <Switch
                    checked={preferences.show_images}
                    onCheckedChange={(checked) => 
                      setPreferences(prev => ({ ...prev, show_images: checked }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Brief style</Label>
                    <p className="text-xs text-muted-foreground">How detailed your updates should be</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={preferences.brief_style === 'concise' ? 'default' : 'outline'}
                      onClick={() => setPreferences(prev => ({ ...prev, brief_style: 'concise' }))}
                    >
                      Concise
                    </Button>
                    <Button
                      size="sm"
                      variant={preferences.brief_style === 'detailed' ? 'default' : 'outline'}
                      onClick={() => setPreferences(prev => ({ ...prev, brief_style: 'detailed' }))}
                    >
                      Detailed
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Fixed Save button */}
        <div className="flex-shrink-0 pt-4 border-t border-border/50">
          <Button 
            onClick={savePreferences} 
            className="w-full gap-2"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Save Preferences
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
