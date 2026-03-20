import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  ArrowLeft, Send, Loader2, MoreVertical, Sparkles, Settings, RotateCcw, Check,
  Dna, ChevronDown, Zap, Brain, BotMessageSquare, MapPin, Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import { cn } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAIProfile, AI_MODELS, type AIModel } from '@/hooks/useAIProfile';
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

// Quick suggestion chips
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
  const { name: aiName, personality: aiPersonality, model, feedDNA, updateName, updatePersonality, updateModel, updateFeedDNA, resetToDefault } = useAIProfile();
  const [messages, setMessages] = useState<Message[]>(() => {
    const loaded = loadMessages();
    if (loaded.length === 0) {
      return [{ role: 'assistant', content: `Hey! I'm ${aiName} — your AI on VYBE. I can help with anything from content ideas to coding questions. What's on your mind? ✨`, timestamp: new Date() }];
    }
    return loaded;
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editName, setEditName] = useState(aiName);
  const [editPersonality, setEditPersonality] = useState(aiPersonality);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [connectedAccounts, setConnectedAccounts] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('vybe_connected_ai') || '[]')); } catch { return new Set(); }
  });
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; city?: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); }, [messages]);
  useEffect(() => { setEditName(aiName); setEditPersonality(aiPersonality); }, [aiName, aiPersonality]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // GPS location tracking
  const enableLocation = useCallback(() => {
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
        toast.success('📍 Location enabled for AI');
      },
      () => toast.error('Location permission denied'),
      { enableHighAccuracy: true }
    );
  }, []);

  const toggleConnectedAccount = useCallback((name: string) => {
    setConnectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      localStorage.setItem('vybe_connected_ai', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const currentModel = useMemo(() => AI_MODELS.find(m => m.id === model) || AI_MODELS[0], [model]);

  const handleSaveSettings = useCallback(() => {
    updateName(editName);
    updatePersonality(editPersonality);
    setIsSettingsOpen(false);
    toast.success('AI updated!');
  }, [editName, editPersonality, updateName, updatePersonality]);

  const sendMessage = useCallback(async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || isLoading) return;

    const userMessage: Message = { role: 'user', content: msgText, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let assistantContent = '';

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
            model,
            feedDNA,
            location: userLocation ? { lat: userLocation.lat, lng: userLocation.lng, city: userLocation.city } : null,
            connectedProviders: [...connectedAccounts],
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

      setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date() }]);

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
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent, timestamp: new Date() };
                return updated;
              });
            }
          } catch { buffer = line + '\n' + buffer; break; }
        }
      }
      
      // Final flush
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
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent, timestamp: new Date() };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: "Oops, something went wrong. Try again!", timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, aiName, aiPersonality, model, feedDNA]);

  const clearChat = useCallback(() => {
    setMessages([{ role: 'assistant', content: `Fresh start! I'm ${aiName}, ready when you are ✨`, timestamp: new Date() }]);
  }, [aiName]);

  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const showQuickPrompts = messages.length <= 2 && !isLoading;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex flex-col bg-background">
        {/* Header - Snapchat AI style */}
        <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-2.5 bg-card/80 backdrop-blur-md sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => navigate('/messages')} className="h-8 w-8 -ml-1">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          <button onClick={() => setIsSettingsOpen(true)} className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative">
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-md shadow-primary/20">
                <VybeMiniIcon size={18} showSparkles={false} />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm truncate flex items-center gap-1">
                {aiName}
                <Sparkles className="h-3 w-3 text-primary flex-shrink-0" />
              </h2>
              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                {currentModel.icon} {currentModel.name}
                {feedDNA && <Dna className="h-2.5 w-2.5 text-accent" />}
              </p>
            </div>
          </button>

          {/* Model quick-switch */}
          <DropdownMenu open={showModelPicker} onOpenChange={setShowModelPicker}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                {currentModel.icon}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">AI Model</div>
              <DropdownMenuSeparator />
              {AI_MODELS.map(m => (
                <DropdownMenuItem key={m.id} onClick={() => { updateModel(m.id); setShowModelPicker(false); }}>
                  <span className="mr-2">{m.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground">{m.description}</div>
                  </div>
                  {model === m.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

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
              <DropdownMenuItem onClick={() => setIsConnectOpen(true)}>
                <Zap className="h-4 w-4 mr-2" /> Connect AI Account
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={clearChat}>Clear Chat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Messages - only this area scrolls */}
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
                  {message.content ? (
                    message.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0 [&_pre]:text-xs [&_code]:text-xs">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : message.content
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2 }} className="flex gap-0.5">
                        <span className="w-1.5 h-1.5 bg-current rounded-full" />
                        <span className="w-1.5 h-1.5 bg-current rounded-full" style={{ animationDelay: '0.2s' }} />
                        <span className="w-1.5 h-1.5 bg-current rounded-full" style={{ animationDelay: '0.4s' }} />
                      </motion.div>
                    </span>
                  )}
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

          {/* Quick prompt chips */}
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

        {/* Input bar */}
        <div className="px-3 py-2.5 border-t border-border/40 bg-card shrink-0">
          <div className="flex items-center gap-1 mb-1.5 px-1">
            {feedDNA && (
              <div className="flex items-center gap-1">
                <Dna className="h-2.5 w-2.5 text-accent" />
                <span className="text-[9px] text-accent/80">Learning your vibes</span>
              </div>
            )}
            {locationEnabled && userLocation && (
              <div className="flex items-center gap-1 ml-auto">
                <MapPin className="h-2.5 w-2.5 text-primary" />
                <span className="text-[9px] text-primary/80">{userLocation.city || 'GPS active'}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9 rounded-full shrink-0", locationEnabled ? "text-primary" : "text-muted-foreground")}
              onClick={() => locationEnabled ? setLocationEnabled(false) : enableLocation()}
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

      {/* Settings Sheet */}
      <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <BotMessageSquare className="h-5 w-5 text-primary" />
              Customize Your AI
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-4 space-y-5 overflow-y-auto max-h-[calc(80vh-8rem)]">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="ai-name" className="text-xs font-medium">Name</Label>
              <Input id="ai-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Morgan" maxLength={20} className="h-9" />
            </div>

            {/* Personality */}
            <div className="space-y-1.5">
              <Label htmlFor="ai-personality" className="text-xs font-medium">Personality</Label>
              <Textarea id="ai-personality" value={editPersonality} onChange={(e) => setEditPersonality(e.target.value)} placeholder="Describe how your AI should behave..." rows={3} maxLength={500} className="text-sm" />
            </div>

            {/* Model Picker */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">AI Model</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {AI_MODELS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => updateModel(m.id)}
                    className={cn(
                      "flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left",
                      model === m.id
                        ? "border-primary bg-primary/5"
                        : "border-border/40 hover:border-border"
                    )}
                  >
                    <span className="text-lg">{m.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-[10px] text-muted-foreground">{m.description}</div>
                    </div>
                    {model === m.id && <Check className="h-4 w-4 text-primary" />}
                    <span className={cn(
                      "text-[9px] px-1.5 py-0.5 rounded-full",
                      m.speed === 'fast' ? 'bg-green-500/10 text-green-500' :
                      m.speed === 'balanced' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-purple-500/10 text-purple-500'
                    )}>{m.speed}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* DNA Feed Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40">
              <div className="flex items-center gap-2.5">
                <Dna className="h-5 w-5 text-accent" />
                <div>
                  <div className="text-sm font-medium">Feed VYBE DNA</div>
                  <div className="text-[10px] text-muted-foreground">Let AI learn your interests to personalize content</div>
                </div>
              </div>
              <Switch checked={feedDNA} onCheckedChange={updateFeedDNA} />
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleSaveSettings} className="w-full">
                <Check className="h-4 w-4 mr-2" /> Save Changes
              </Button>
              <Button variant="outline" onClick={() => { resetToDefault(); setEditName('Morgan'); setEditPersonality('A friendly, helpful AI assistant.'); toast.success('Reset to default'); }} className="w-full">
                <RotateCcw className="h-4 w-4 mr-2" /> Reset Default
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Connect AI Account Sheet */}
      <Sheet open={isConnectOpen} onOpenChange={setIsConnectOpen}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Connect AI Services
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-4 space-y-3 overflow-y-auto max-h-[calc(70vh-8rem)] overscroll-contain touch-pan-y">
            <p className="text-sm text-muted-foreground">Connect services to enhance your AI experience. Your AI will use these to provide richer responses.</p>
            
            {/* GPS Location */}
            <button
              onClick={() => { locationEnabled ? setLocationEnabled(false) : enableLocation(); }}
              className={cn(
                "w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all active:scale-[0.98]",
                locationEnabled ? "border-primary/50 bg-primary/10" : "border-border/50 bg-gradient-to-r from-primary/10 to-accent/10"
              )}
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold">GPS Location</div>
                <div className="text-[11px] text-muted-foreground">
                  {locationEnabled && userLocation?.city ? `📍 ${userLocation.city}` : 'Help AI with location-aware answers'}
                </div>
              </div>
              <div className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-full",
                locationEnabled ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
              )}>
                {locationEnabled ? 'On' : 'Enable'}
              </div>
            </button>
            
            {/* AI Services */}
            <div className="pt-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">AI Providers</span>
            </div>
            {[
              { name: 'ChatGPT', icon: '🤖', desc: 'OpenAI GPT models for deep reasoning', color: 'from-green-500/10 to-emerald-500/10', modelId: 'gpt-5' },
              { name: 'Google Gemini', icon: '✨', desc: 'Multimodal AI with vision & search', color: 'from-blue-500/10 to-cyan-500/10', modelId: 'gemini-flash' },
              { name: 'Claude', icon: '🧠', desc: 'Thoughtful analysis & writing', color: 'from-orange-500/10 to-amber-500/10', modelId: 'gpt-5-mini' },
              { name: 'Perplexity', icon: '🔍', desc: 'Real-time web search + AI answers', color: 'from-purple-500/10 to-violet-500/10', modelId: 'gemini-pro' },
            ].map((ai) => {
              const isConnected = connectedAccounts.has(ai.name);
              return (
                <button
                  key={ai.name}
                  onClick={() => {
                    toggleConnectedAccount(ai.name);
                    if (!isConnected) {
                      updateModel(ai.modelId as any);
                      toast.success(`${ai.name} connected! Switched to ${ai.name} model.`);
                    } else {
                      toast(`${ai.name} disconnected`);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all active:scale-[0.98]",
                    isConnected ? "border-primary/50 bg-primary/5" : "border-border/50 bg-gradient-to-r " + ai.color,
                  )}
                >
                  <span className="text-2xl">{ai.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-semibold flex items-center gap-1.5">
                      {ai.name}
                      {isConnected && <Check className="h-3 w-3 text-primary" />}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{ai.desc}</div>
                  </div>
                  <div className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-full transition-all",
                    isConnected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                  )}>
                    {isConnected ? 'Connected' : 'Connect'}
                  </div>
                </button>
              );
            })}

            <div className="pt-3 border-t border-border/40 space-y-2">
              <p className="text-[11px] text-muted-foreground text-center">
                All services are powered by VYBE's AI infrastructure. Connecting a provider switches your active model.
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
