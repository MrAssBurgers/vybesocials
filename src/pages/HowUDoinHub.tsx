import { useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Heart, 
  Users, 
  Compass, 
  Target,
  Calendar,
  BookOpen,
  MessageCircle,
  ChevronRight,
  Star
} from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppLayout } from '@/components/layout/AppLayout';
import { EventCard } from '@/components/events/EventCard';
import { useGlobalEvents } from '@/hooks/useGlobalEvents';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface HubContent {
  id: string;
  pillar: 'fun' | 'connection' | 'discovery' | 'direction';
  title: string;
  description: string | null;
  content_type: 'resource' | 'challenge' | 'event' | 'tip';
  content_url: string | null;
  image_url: string | null;
  is_featured: boolean;
  display_order: number;
  starts_at: string | null;
  ends_at: string | null;
}

interface CheckinPrompt {
  id: string;
  prompt_text: string;
  pillar: 'fun' | 'connection' | 'discovery' | 'direction' | null;
}

const PILLARS = [
  { 
    id: 'fun', 
    name: 'Fun', 
    icon: Sparkles, 
    color: 'from-pink-500 to-rose-500',
    description: 'Joy, play, and celebration'
  },
  { 
    id: 'connection', 
    name: 'Connection', 
    icon: Heart, 
    color: 'from-red-500 to-orange-500',
    description: 'Relationships and community'
  },
  { 
    id: 'discovery', 
    name: 'Discovery', 
    icon: Compass, 
    color: 'from-blue-500 to-cyan-500',
    description: 'Learning and exploration'
  },
  { 
    id: 'direction', 
    name: 'Direction', 
    icon: Target, 
    color: 'from-green-500 to-emerald-500',
    description: 'Purpose and growth'
  },
];

const PillarCard = memo(function PillarCard({ 
  pillar, 
  onClick 
}: { 
  pillar: typeof PILLARS[0]; 
  onClick: () => void;
}) {
  const Icon = pillar.icon;
  
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl p-6 text-left",
        "bg-gradient-to-br", pillar.color,
        "text-white shadow-lg",
        "transition-all duration-300"
      )}
    >
      <div className="relative z-10">
        <Icon className="h-8 w-8 mb-3 opacity-90" />
        <h3 className="text-xl font-bold mb-1">{pillar.name}</h3>
        <p className="text-sm opacity-80">{pillar.description}</p>
      </div>
      
      {/* Decorative circles */}
      <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-white/10" />
      <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/5" />
    </motion.button>
  );
});

const ContentCard = memo(function ContentCard({ content }: { content: HubContent }) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    triggerHaptic('light');
    if (content.content_url) {
      if (content.content_url.startsWith('http')) {
        window.open(content.content_url, '_blank');
      } else {
        navigate(content.content_url);
      }
    }
  };
  
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      className={cn(
        "w-full text-left p-4 rounded-xl",
        "liquid-glass-card border border-border/50",
        "transition-all duration-200 hover:border-primary/30"
      )}
    >
      <div className="flex items-start gap-3">
        {content.image_url ? (
          <img
            src={content.image_url}
            alt=""
            className="h-16 w-16 rounded-xl object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            {content.content_type === 'challenge' && <Star className="h-6 w-6 text-primary" />}
            {content.content_type === 'resource' && <BookOpen className="h-6 w-6 text-primary" />}
            {content.content_type === 'event' && <Calendar className="h-6 w-6 text-primary" />}
            {content.content_type === 'tip' && <MessageCircle className="h-6 w-6 text-primary" />}
          </div>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-[10px]">
              {content.content_type}
            </Badge>
            {content.is_featured && (
              <Badge className="text-[10px] bg-primary">Featured</Badge>
            )}
          </div>
          <h4 className="font-medium text-sm line-clamp-1">{content.title}</h4>
          {content.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {content.description}
            </p>
          )}
        </div>
        
        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      </div>
    </motion.button>
  );
});

const WeeklyCheckin = memo(function WeeklyCheckin({ prompt }: { prompt: CheckinPrompt }) {
  const [response, setResponse] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  
  const handleSubmit = async () => {
    if (!mood) return;
    
    triggerHaptic('medium');
    
    try {
      await supabase.from('user_checkins').insert({
        prompt_id: prompt.id,
        response: response.trim() || null,
        mood_rating: mood,
        is_private: true,
      } as any);
      
      setSubmitted(true);
    } catch (error) {
      console.error('Failed to submit check-in:', error);
    }
  };
  
  if (submitted) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="p-6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="text-4xl mb-3"
          >
            🌟
          </motion.div>
          <h3 className="font-semibold mb-1">Thanks for checking in!</h3>
          <p className="text-sm text-muted-foreground">
            Your reflection has been saved privately
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Weekly Check-in
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{prompt.prompt_text}</p>
        
        {/* Mood selector */}
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((level) => (
            <motion.button
              key={level}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setMood(level)}
              className={cn(
                "h-10 w-10 rounded-full text-lg transition-all",
                mood === level 
                  ? "bg-primary text-primary-foreground scale-110" 
                  : "bg-muted hover:bg-muted-foreground/20"
              )}
            >
              {level === 1 && '😔'}
              {level === 2 && '😕'}
              {level === 3 && '😐'}
              {level === 4 && '🙂'}
              {level === 5 && '😊'}
            </motion.button>
          ))}
        </div>
        
        {/* Optional response */}
        <textarea
          placeholder="Add a private note (optional)..."
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          className={cn(
            "w-full h-20 rounded-lg p-3 text-sm resize-none",
            "bg-muted/50 border border-border/50",
            "focus:outline-none focus:ring-2 focus:ring-primary/50"
          )}
        />
        
        <Button 
          onClick={handleSubmit} 
          disabled={!mood}
          className="w-full"
        >
          Submit Check-in
        </Button>
      </CardContent>
    </Card>
  );
});

export default function HowUDoinHub() {
  const navigate = useNavigate();
  const [activePillar, setActivePillar] = useState<string | null>(null);
  
  // Fetch hub content
  const { data: hubContent } = useQuery({
    queryKey: ['hub-content', activePillar],
    queryFn: async () => {
      let query = supabase
        .from('hub_content')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (activePillar) {
        query = query.eq('pillar', activePillar);
      } else {
        query = query.eq('is_featured', true);
      }
      
      const { data, error } = await query.limit(10);
      if (error) throw error;
      return data as HubContent[];
    },
  });
  
  // Fetch weekly check-in prompt
  const { data: checkinPrompt } = useQuery({
    queryKey: ['checkin-prompt'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkin_prompts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as CheckinPrompt | null;
    },
  });
  
  // Fetch upcoming hub events
  const { data: events } = useGlobalEvents({ 
    upcoming: true, 
    category: 'howudoin'
  });

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            How U Doin?
          </h1>
          <p className="text-muted-foreground mt-2">
            Fun • Connection • Discovery • Direction
          </p>
        </motion.div>

        {/* Pillar Grid */}
        <div className="grid grid-cols-2 gap-4">
          {PILLARS.map((pillar, i) => (
            <motion.div
              key={pillar.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
            >
              <PillarCard
                pillar={pillar}
                onClick={() => setActivePillar(
                  activePillar === pillar.id ? null : pillar.id
                )}
              />
            </motion.div>
          ))}
        </div>

        {/* Active Pillar Content */}
        <AnimatePresence mode="wait">
          {activePillar && (
            <motion.div
              key={activePillar}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold capitalize">
                  {activePillar} Resources
                </h2>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setActivePillar(null)}
                >
                  View All
                </Button>
              </div>
              
              <div className="space-y-3">
                {hubContent?.map((content) => (
                  <ContentCard key={content.id} content={content} />
                ))}
                
                {hubContent?.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No content yet. Check back soon!
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Featured Content (when no pillar selected) */}
        {!activePillar && hubContent && hubContent.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Featured</h2>
            <div className="space-y-3">
              {hubContent.map((content) => (
                <ContentCard key={content.id} content={content} />
              ))}
            </div>
          </div>
        )}

        {/* Weekly Check-in */}
        {checkinPrompt && (
          <WeeklyCheckin prompt={checkinPrompt} />
        )}

        {/* Upcoming Events */}
        {events && events.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Upcoming Events
              </h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/events')}
              >
                View All
              </Button>
            </div>
            
            <div className="space-y-4">
              {events.slice(0, 3).map((event) => (
                <EventCard key={event.id} event={event} compact />
              ))}
            </div>
          </div>
        )}

        {/* Kickoff Event CTA */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-accent/10">
          <CardContent className="p-6 text-center">
            <motion.div
              animate={{ 
                rotate: [0, -10, 10, -10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                repeatDelay: 3 
              }}
              className="text-4xl mb-4"
            >
              🎉
            </motion.div>
            <h3 className="text-lg font-semibold mb-2">
              How U Doin x VYBE Kickoff
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Join our launch event to connect with the community
            </p>
            <Button onClick={() => navigate('/events')}>
              View Events
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
