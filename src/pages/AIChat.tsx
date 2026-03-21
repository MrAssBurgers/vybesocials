import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  ArrowLeft, Send, Loader2, MoreVertical, Sparkles, Settings, RotateCcw, Check,
  Dna, MapPin, BotMessageSquare, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import { cn } from '@/lib/utils';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import ReactMarkdown from 'react-markdown';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

const STORAGE_KEY = 'vybe_ai_chat_messages_v2';
function loadMessages(): Message[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {}
  return [];
}
function saveMessages(messages: Message[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100))); } catch {}
}

const AI_NAME_KEY = 'vybe_ai_name';
const AI_PERSONALITY_KEY = 'vybe_ai_personality';
const AI_DNA_KEY = 'vybe_ai_dna';

function loadSetting(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

const QUICK_PROMPTS = [
  '💡 Give me a content idea',
  '📝 Help me write a caption',
  '🎯 How to grow my audience?',
  '🧬 What does my DNA say?',
  '📍 What\'s near me right now?',
  '💻 Help me code something',
];

export default function AIChat() {
  const navigate = useNavigate();
  const streamingContentRef = useRef('');
  
  // Simple settings — no model picker, no API key nonsense
  const [aiName, setAiName] = useState(() => loadSetting(AI_NAME_KEY, 'Morgan'));
  const [aiPersonality, setAiPersonality] = useState(() => loadSetting(AI_PERSONALITY_KEY, 'A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping.'));
  const [feedDNA, setFeedDNA] = useState(() => loadSetting(AI_DNA_KEY, 'true') === 'true');
  
  const [messages, setMessages] = useState<Message[]>(() => {
    const loaded = loadMessages();
    if (loaded.length === 0) {
      return [{ role: 'assistant', content: `Hey! I'm ${loadSetting(AI_NAME_KEY, 'Morgan')} — your AI on VYBE. I can help with anything from content ideas to coding questions. What's on your mind? ✨`, timestamp: new Date() }];
    }
    return loaded;
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState(''); // live streaming text for the current response
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editName, setEditName] = useState(aiName);
  const [editPersonality, setEditPersonality] = useState(aiPersonality);
  const [locationEnabled, setLocationEnabled] = useState(() => {
    try { return localStorage.getItem('vybe_ai_location') === 'true'; } catch { return false; }
  });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; city?: string } | null>(null);
  const [showGPSDialog, setShowGPSDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveMessages(messages); }, [messages]);
  // Auto-scroll on streaming text changes too
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); }, [messages, streamingText]);
  useEffect(() => { setEditName(aiName); setEditPersonality(aiPersonality); }, [aiName, aiPersonality]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const requestGPSPermission = useCallback(() => {
    setShowGPSDialog(true);
  }, []);

  const enableLocation = useCallback(() => {
    setShowGPSDialog(false);
    if (!navigator.geolocation) { toast.error('GPS not supported on this device'); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lng}&format=json`);
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village || 'Unknown';
          setUserLocation({ ...loc, city });
        } catch {
          setUserLocation(loc);
        }
        setLocationEnabled(true);
        toast.success('📍 Location enabled');
      },
      () => toast.error('Location permission denied'),
      { enableHighAccuracy: true }
    );
  }, []);

  const handleSaveSettings = useCallback(() => {
    const name = editName.trim() || 'Morgan';
    const personality = editPersonality.trim() || 'A friendly, helpful AI assistant.';
    setAiName(name);
    setAiPersonality(personality);
    localStorage.setItem(AI_NAME_KEY, name);
    localStorage.setItem(AI_PERSONALITY_KEY, personality);
    setIsSettingsOpen(false);
    toast.success('AI updated!');
  }, [editName, editPersonality]);

  const toggleDNA = useCallback((val: boolean) => {
    setFeedDNA(val);
    localStorage.setItem(AI_DNA_KEY, String(val));
  }, []);

  const sendMessage = useCallback(async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || isLoading) return;

    const userMessage: Message = { role: 'user', content: msgText, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let assistantContent = '';
    streamingContentRef.current = '';

    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: messages.map(m => ({ role: m.role, content: m.content })).concat([{ role: 'user', content: msgText }]),
            aiName,
            aiPersonality,
            model: 'gemini-flash',
            feedDNA,
            location: userLocation ? { lat: userLocation.lat, lng: userLocation.lng, city: userLocation.city } : null,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) { toast.error('Too many requests. Wait a moment.'); return; }
        if (response.status === 402) { toast.error('AI credits exhausted.'); return; }
        throw new Error('Failed to get response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      // Show empty assistant bubble with typing dots
      setStreamingText('');

      let buffer = '';
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              streamingContentRef.current = assistantContent;
              // Update streaming text directly — lightweight, only re-renders the bubble
              setStreamingText(assistantContent);
            }
          } catch { buffer = line + '\n' + buffer; break; }
        }
      }
      
      // Process any remaining buffer
      if (buffer.trim()) {
        for (const raw of buffer.split('\n')) {
          if (!raw || raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              streamingContentRef.current = assistantContent;
              setStreamingText(assistantContent);
            }
          } catch {}
        }
      }

      // Finalize: commit the completed message to the messages array
      setMessages(prev => [...prev, { role: 'assistant', content: assistantContent, timestamp: new Date() }]);
      setStreamingText('');
      streamingContentRef.current = '';
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Oops, something went wrong. Try again!", timestamp: new Date() }]);
      setStreamingText('');
      streamingContentRef.current = '';
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, aiName, aiPersonality, feedDNA, userLocation]);

  const clearChat = useCallback(() => {
    setMessages([{ role: 'assistant', content: `Fresh start! I'm ${aiName}, ready when you are ✨`, timestamp: new Date() }]);
  }, [aiName]);

  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const showQuickPrompts = messages.length <= 2 && !isLoading;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex flex-col bg-background">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2.5 bg-card/80 backdrop-blur-md sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => navigate('/messages')} className="h-8 w-8 -ml-1">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-md shadow-primary/20">
                <VybeMiniIcon size={18} showSparkles={false} />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card bg-green-500" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm truncate flex items-center gap-1">
                {aiName}
                <Sparkles className="h-3 w-3 text-primary flex-shrink-0" />
              </h2>
              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                VYBE AI
                {feedDNA && <Dna className="h-2.5 w-2.5 text-accent" />}
                {locationEnabled && <MapPin className="h-2.5 w-2.5 text-primary" />}
              </p>
            </div>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                <Settings className="h-4 w-4 mr-2" /> Customize AI
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={clearChat}>Clear Chat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 space-y-3">
          {messages.map((message, index) => (
            <motion.div
              key={index}
              initial={index === messages.length - 1 ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={cn("flex gap-2", message.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {message.role === 'assistant' && (
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-accent flex-shrink-0 flex items-center justify-center mt-0.5">
                  <VybeMiniIcon size={14} showSparkles={false} />
                </div>
              )}
              <div className="flex flex-col max-w-[82%]">
                <div className={cn(
                  "rounded-2xl px-3 py-2 text-[13px] leading-relaxed",
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-md'
                    : 'bg-muted/60 rounded-tl-md border border-border/30'
                )}>
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0 [&_pre]:text-xs [&_code]:text-xs">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : message.content}
                </div>
                <span className={cn(
                  "text-[9px] text-muted-foreground/60 mt-0.5 px-1",
                  message.role === 'user' ? 'text-right' : 'text-left'
                )}>
                  {formatTime(message.timestamp)}
                </span>
              </div>
            </motion.div>
          ))}

          {/* Live streaming bubble — separate from committed messages */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex gap-2 justify-start"
            >
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-accent flex-shrink-0 flex items-center justify-center mt-0.5">
                <VybeMiniIcon size={14} showSparkles={false} />
              </div>
              <div className="flex flex-col max-w-[82%]">
                <div className="rounded-2xl px-3 py-2 text-[13px] leading-relaxed bg-muted/60 rounded-tl-md border border-border/30">
                  {streamingText ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0 [&_pre]:text-xs [&_code]:text-xs">
                      <ReactMarkdown>{streamingText}</ReactMarkdown>
                      <span className="inline-block w-[2px] h-[14px] bg-foreground/70 ml-0.5 align-middle animate-pulse" />
                    </div>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2 }} className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-current rounded-full" />
                        <span className="w-1.5 h-1.5 bg-current rounded-full" />
                        <span className="w-1.5 h-1.5 bg-current rounded-full" />
                      </motion.div>
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {showQuickPrompts && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-wrap gap-1.5 pt-2"
              >
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="px-3 py-1.5 rounded-full bg-muted/50 border border-border/40 text-xs text-foreground/80 hover:bg-muted transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-2.5 border-t border-border/40 bg-card shrink-0">
          <div className="flex items-center gap-1 mb-1.5 px-1">
            {feedDNA && (
              <div className="flex items-center gap-1">
                <Dna className="h-2.5 w-2.5 text-accent" />
                <span className="text-[9px] text-accent/80">Learning your vibes</span>
              </div>
            )}
            <button
              onClick={() => locationEnabled ? setLocationEnabled(false) : requestGPSPermission()}
              className="flex items-center gap-1 ml-auto"
            >
              <div className={cn("w-1.5 h-1.5 rounded-full", locationEnabled ? "bg-green-500" : "bg-destructive")} />
              <span className={cn("text-[9px] font-medium", locationEnabled ? "text-green-500" : "text-destructive/80")}>
                Location {locationEnabled ? 'on' : 'off'}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9 rounded-full shrink-0", locationEnabled ? "text-green-500" : "text-muted-foreground")}
              onClick={() => locationEnabled ? setLocationEnabled(false) : requestGPSPermission()}
            >
              <MapPin className="h-4 w-4" />
            </Button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message ${aiName}...`}
              className="flex-1 h-9 text-sm rounded-full bg-muted/40 border-border/30 px-4"
              disabled={isLoading}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              size="icon"
              className="h-9 w-9 rounded-full shrink-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Settings Sheet - simplified */}
      <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <BotMessageSquare className="h-5 w-5 text-primary" />
              Customize Your AI
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-4 space-y-5 overflow-y-auto max-h-[calc(70vh-8rem)]">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="ai-name" className="text-xs font-medium">AI Name</Label>
              <Input id="ai-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Morgan" maxLength={20} className="h-9" />
            </div>

            {/* Personality */}
            <div className="space-y-1.5">
              <Label htmlFor="ai-personality" className="text-xs font-medium">Personality</Label>
              <Textarea id="ai-personality" value={editPersonality} onChange={(e) => setEditPersonality(e.target.value)} placeholder="Describe how your AI should behave..." rows={3} maxLength={500} className="text-sm" />
            </div>

            {/* DNA Feed */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40">
              <div className="flex items-center gap-2.5">
                <Dna className="h-5 w-5 text-accent" />
                <div>
                  <div className="text-sm font-medium">DNA Learning</div>
                  <div className="text-[10px] text-muted-foreground">AI learns your interests from conversations</div>
                </div>
              </div>
              <Switch checked={feedDNA} onCheckedChange={toggleDNA} />
            </div>

            {/* GPS */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40">
              <div className="flex items-center gap-2.5">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-sm font-medium">Location</div>
                  <div className="text-[10px] text-muted-foreground">
                    {locationEnabled && userLocation?.city ? `📍 ${userLocation.city}` : 'Enable for location-aware answers'}
                  </div>
                </div>
              </div>
              <Switch checked={locationEnabled} onCheckedChange={(val) => val ? requestGPSPermission() : setLocationEnabled(false)} />
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleSaveSettings} className="w-full">
                <Check className="h-4 w-4 mr-2" /> Save Changes
              </Button>
              <Button variant="outline" onClick={() => {
                setEditName('Morgan');
                setEditPersonality('A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping.');
                setAiName('Morgan');
                setAiPersonality('A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping.');
                localStorage.setItem(AI_NAME_KEY, 'Morgan');
                localStorage.setItem(AI_PERSONALITY_KEY, 'A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping.');
                toast.success('Reset to default');
              }} className="w-full">
                <RotateCcw className="h-4 w-4 mr-2" /> Reset Default
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* GPS Privacy Dialog */}
      <AlertDialog open={showGPSDialog} onOpenChange={setShowGPSDialog}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-500" />
              Enable Location
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2 text-sm">
              <p>Your location is used <strong>only on your device</strong> to give the AI local recommendations (nearby places, events, weather, etc.).</p>
              <p className="text-xs text-muted-foreground border-l-2 border-green-500/50 pl-2">
                🔒 <strong>VYBE does not store, collect, or have access to your location data.</strong> It stays entirely on your phone and is sent directly to the AI per-request. We never see it.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={enableLocation} className="bg-green-600 hover:bg-green-700">
              <MapPin className="h-4 w-4 mr-1" /> Enable GPS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
