import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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
      const { data, error } = await supabase
        .from('ai_brief_preferences')
        .select('*')
        .eq('user_id', user.id)
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
      const { error } = await supabase
        .from('ai_brief_preferences')
        .upsert({
          user_id: user.id,
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
    if (!topic.trim()) return;
    if (preferences.custom_topics.includes(topic)) return;
    
    setPreferences(prev => ({
      ...prev,
      custom_topics: [...prev.custom_topics, topic.trim()]
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

  const toggleExclude = (topic: string) => {
    setPreferences(prev => ({
      ...prev,
      excluded_topics: prev.excluded_topics.includes(topic)
        ? prev.excluded_topics.filter(t => t !== topic)
        : [...prev.excluded_topics, topic]
    }));
    haptics.tap();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Customize Your Brief
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100%-120px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6 pb-4">
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
        </ScrollArea>

        {/* Save button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
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
