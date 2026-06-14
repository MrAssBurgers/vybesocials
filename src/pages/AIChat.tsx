import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  ArrowLeft, Send, Loader2, MoreVertical, Sparkles, Settings, RotateCcw, Check,
  Dna, MapPin, BotMessageSquare, Shield, ImagePlus, X, Wand2, Copy, ScanLine, Bot, User
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
import { getEdgeFunctionUrl, getFunctionAuthHeaders, isLegacySupabaseProject, formatAiChatError } from '@/lib/functionAuth';
import { getCanonicalPublishableKey } from '@/lib/canonicalSupabase';
import { fetchWithTimeout } from '@/lib/withTimeout';
import { useVybeAgent, shouldFallbackToAiChat, isAgentAuthError, isAgentUnavailableError } from '@/lib/agent/useVybeAgent';
import { shouldSkipAgentDueToAuth, clearAgentAuthFailure, messageWantsCloudAgent } from '@/lib/agent/aiChatRouting';
import { parseLocalAgentPlan } from '@/lib/agent/localAgentCommands';
import { isAgentMarkedUnavailable, markAgentUnavailable } from '@/lib/agent/agentAvailability';
import { formatAgentActionSummary } from '@/lib/agent/formatActionSummary';
import { cn } from '@/lib/utils';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import ReactMarkdown from 'react-markdown';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  imageUrl?: string;
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
  '✍️ Humanize my essay',
  '📬 Open my messages',
  '🌙 Make my app dark and moody',
  '📝 Help me write a caption',
  '🏠 Hide the stories widget',
  '🎯 How to grow my audience?',
  '🧬 What does my DNA say?',
];

const AI_CHAT_FETCH_MS = 45_000;
const AI_CHAT_STREAM_MS = 90_000;
const AI_CHAT_STREAM_IDLE_MS = 15_000;

// Resize image to max dimension and return base64
async function imageToBase64(file: File, maxSize = 1024): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round(height * maxSize / width); width = maxSize; }
          else { width = Math.round(width * maxSize / height); height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, 0.85);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType });
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AIChat() {
  const navigate = useNavigate();
  const { sendAndExecute, executePlan } = useVybeAgent();
  const streamingContentRef = useRef('');
  
  const [aiName, setAiName] = useState(() => loadSetting(AI_NAME_KEY, 'VYBE-AI'));
  const [aiPersonality, setAiPersonality] = useState(() => loadSetting(AI_PERSONALITY_KEY, 'A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping.'));
  const [feedDNA, setFeedDNA] = useState(() => loadSetting(AI_DNA_KEY, 'true') === 'true');
  
  const [messages, setMessages] = useState<Message[]>(() => {
    const loaded = loadMessages();
    if (loaded.length === 0) {
      return [{ role: 'assistant', content: `Hey! I'm ${loadSetting(AI_NAME_KEY, 'VYBE-AI')} — your VYBE agent. Chat with me, or ask me to open Messages, change your theme, or rearrange your home screen. What's up? ✨`, timestamp: new Date() }];
    }
    return loaded;
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editName, setEditName] = useState(aiName);
  const [editPersonality, setEditPersonality] = useState(aiPersonality);
  const [locationEnabled, setLocationEnabled] = useState(() => {
    try { return localStorage.getItem('vybe_ai_location') === 'true'; } catch { return false; }
  });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; city?: string } | null>(null);
  const [showGPSDialog, setShowGPSDialog] = useState(false);
  
  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Humanizer state
  const [isHumanizerOpen, setIsHumanizerOpen] = useState(false);
  const [humanizerTab, setHumanizerTab] = useState<'humanize' | 'detect'>('humanize');
  const [humanizerInput, setHumanizerInput] = useState('');
  const [humanizerOutput, setHumanizerOutput] = useState('');
  const [humanizerTone, setHumanizerTone] = useState<'natural' | 'casual' | 'academic'>('natural');
  const [isHumanizing, setIsHumanizing] = useState(false);
  const [humanizerElapsed, setHumanizerElapsed] = useState(0); // seconds
  const [humanizerProgress, setHumanizerProgress] = useState(0); // 0-100 estimated
  const [detectorStage, setDetectorStage] = useState<string>('');
  const [detectorProgress, setDetectorProgress] = useState(0);
  // Detector state
  const [detectorInput, setDetectorInput] = useState('');
  const [detectorResult, setDetectorResult] = useState<null | {
    ai_probability: number;
    verdict: string;
    reason: string;
    metrics: {
      burstiness: number;
      uniformity: number;
      ai_tells_count: number;
      ai_tells_matched: string[];
      repetition: number;
      word_count: number;
      sentence_count: number;
    };
  }>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  useEffect(() => { saveMessages(messages); }, [messages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }); }, [messages, streamingText]);
  useEffect(() => { setEditName(aiName); setEditPersonality(aiPersonality); }, [aiName, aiPersonality]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Skip vybe-agent when edge fn is not deployed (404) — avoids 8s+ delay before ai-chat.
  useEffect(() => {
    if (isAgentMarkedUnavailable()) return;
    fetch(getEdgeFunctionUrl('vybe-agent'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getCanonicalPublishableKey(),
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] }),
    })
      .then((res) => {
        if (res.status === 404) markAgentUnavailable();
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (locationEnabled && navigator.geolocation) {
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
        },
        () => {
          setLocationEnabled(false);
          localStorage.setItem('vybe_ai_location', 'false');
        },
        { enableHighAccuracy: true }
      );
    }
  }, []);  

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
        localStorage.setItem('vybe_ai_location', 'true');
        toast.success('📍 Location enabled');
      },
      () => toast.error('Location permission denied'),
      { enableHighAccuracy: true }
    );
  }, []);

  const handleSaveSettings = useCallback(() => {
    const name = editName.trim() || 'VYBE-AI';
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

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image too large (max 10MB)');
      return;
    }
    setSelectedImage(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  }, []);

  const clearImage = useCallback(() => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [imagePreview]);

  const sendMessage = useCallback(async (text?: string) => {
    const msgText = (text || input).trim();
    if ((!msgText && !selectedImage) || isLoading) return;

    const appendAssistantReply = (content: string) => {
      const reply = content.trim() || "Something went wrong. Try again in a moment.";
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date() }]);
    };

    // Build image data if present
    let imageBase64: string | null = null;
    let imageMimeType: string | null = null;
    let localImageUrl: string | null = null;
    
    if (selectedImage) {
      try {
        const result = await imageToBase64(selectedImage);
        imageBase64 = result.base64;
        imageMimeType = result.mimeType;
        localImageUrl = imagePreview;
      } catch {
        toast.error('Failed to process image');
        return;
      }
    }

    const userMessage: Message = { 
      role: 'user', 
      content: msgText || '📷 [Image]', 
      timestamp: new Date(),
      imageUrl: localImageUrl || undefined,
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    clearImage();
    // Show typing indicator immediately — before agent/encode/network work
    setIsLoading(true);
    setStreamingText('');

    let assistantContent = '';
    streamingContentRef.current = '';

    try {
      const chatHistory = messages.map(m => ({ role: m.role, content: m.content })).concat([
        { role: 'user' as const, content: msgText || 'What is in this image?' },
      ]);

      // Local agent (open messages, themes) — no edge fn required
      if (!imageBase64) {
        const localPlan = parseLocalAgentPlan(msgText);
        if (localPlan) {
          const batch = await executePlan(localPlan);
          const summary = formatAgentActionSummary(batch);
          appendAssistantReply((localPlan.message.trim() || 'Done!') + summary);
          return;
        }
      }

      const useAgentPath =
        !imageBase64 &&
        !shouldSkipAgentDueToAuth() &&
        !isAgentMarkedUnavailable() &&
        messageWantsCloudAgent(msgText);

      if (useAgentPath) {
        try {
          const agentResult = await sendAndExecute({
            messages: chatHistory,
            aiName,
            aiPersonality,
            feedDNA,
            location: userLocation ? { lat: userLocation.lat, lng: userLocation.lng, city: userLocation.city } : null,
          });
          clearAgentAuthFailure();
          const summary = agentResult.batch ? formatAgentActionSummary(agentResult.batch) : '';
          appendAssistantReply((agentResult.message.trim() || 'Done!') + summary);
          return;
        } catch (agentErr) {
          if (!shouldFallbackToAiChat(agentErr)) {
            appendAssistantReply(formatAiChatError(agentErr));
            return;
          }
          const localFallback = parseLocalAgentPlan(msgText);
          if (localFallback) {
            const batch = await executePlan(localFallback);
            const summary = formatAgentActionSummary(batch);
            appendAssistantReply((localFallback.message.trim() || 'Done!') + summary);
            return;
          }
          // Fall through to streaming ai-chat
        }
      }

      let headers: Record<string, string>;
      try {
        headers = await getFunctionAuthHeaders();
      } catch (authErr) {
        appendAssistantReply(formatAiChatError(authErr));
        return;
      }
      const body: Record<string, unknown> = {
        messages: chatHistory,
        aiName,
        aiPersonality,
        model: 'gemini-flash',
        feedDNA,
        location: userLocation ? { lat: userLocation.lat, lng: userLocation.lng, city: userLocation.city } : null,
        image_base64: imageBase64,
        image_mime_type: imageMimeType,
      };

      const response = await fetchWithTimeout(
        getEdgeFunctionUrl('ai-chat'),
        { method: 'POST', headers, body: JSON.stringify(body) },
        AI_CHAT_FETCH_MS,
      );

      if (!response.ok) {
        let errMsg = 'Failed to get response';
        try {
          const errData = await response.json();
          errMsg = errData.error || errData.message || errMsg;
        } catch {
          // ignore parse errors
        }
        if (response.status === 429) {
          const rateMsg = 'Too many requests. Wait a moment.';
          toast.error(rateMsg);
          appendAssistantReply(rateMsg);
          return;
        }
        if (response.status === 402) {
          const creditsMsg = 'AI credits exhausted.';
          toast.error(creditsMsg);
          appendAssistantReply(creditsMsg);
          return;
        }
        appendAssistantReply(formatAiChatError(new Error(errMsg), response.status));
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        const rawText = await response.text();
        try {
          const payload = JSON.parse(rawText);
          const text = payload.message || payload.content || payload.error;
          if (text) {
            appendAssistantReply(String(text));
            return;
          }
        } catch {
          if (rawText.trim()) {
            appendAssistantReply(rawText.trim().slice(0, 2000));
            return;
          }
        }
        appendAssistantReply(formatAiChatError(new Error('AI returned an empty response'), response.status));
        return;
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      setStreamingText('');

      let buffer = '';
      let streamDone = false;
      let lastChunkAt = Date.now();
      const streamDeadline = Date.now() + AI_CHAT_STREAM_MS;
      while (!streamDone) {
        if (Date.now() > streamDeadline) {
          throw new DOMException('Stream read timed out', 'AbortError');
        }
        if (!assistantContent && Date.now() - lastChunkAt > AI_CHAT_STREAM_IDLE_MS) {
          throw new DOMException('Stream read timed out waiting for first chunk', 'AbortError');
        }
        const { done, value } = await reader.read();
        if (done) break;
        lastChunkAt = Date.now();
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
              lastChunkAt = Date.now();
              streamingContentRef.current = assistantContent;
              setStreamingText(assistantContent);
            }
          } catch { buffer = line + '\n' + buffer; break; }
        }
      }
      
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
              lastChunkAt = Date.now();
              streamingContentRef.current = assistantContent;
              setStreamingText(assistantContent);
            }
          } catch {}
        }
      }

      appendAssistantReply(assistantContent.trim() || "I couldn't generate a reply. Try again.");
      setStreamingText('');
      streamingContentRef.current = '';
    } catch (error) {
      console.error('AI chat error:', error);
      appendAssistantReply(formatAiChatError(error));
      setStreamingText('');
      streamingContentRef.current = '';
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, aiName, aiPersonality, feedDNA, userLocation, selectedImage, imagePreview, clearImage, sendAndExecute, executePlan]);

  const clearChat = useCallback(() => {
    setMessages([{ role: 'assistant', content: `Fresh start! I'm ${aiName}, ready when you are ✨`, timestamp: new Date() }]);
  }, [aiName]);

  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const showQuickPrompts = messages.length <= 2 && !isLoading;

  const handleQuickPrompt = useCallback((prompt: string) => {
    if (prompt.startsWith('✍️')) { setIsHumanizerOpen(true); return; }
    sendMessage(prompt);
  }, [sendMessage]);

  const runHumanizer = useCallback(async () => {
    const text = humanizerInput.trim();
    if (!text) { toast.error('Paste some text first'); return; }
    if (text.length > 8000) { toast.error('Max 8000 characters'); return; }
    setIsHumanizing(true);
    setHumanizerOutput('');
    setHumanizerElapsed(0);
    setHumanizerProgress(2);
    const startTs = Date.now();
    // Estimated total: ~1.2s setup + ~30ms/word for flash-lite
    const estimatedTotalMs = 1200 + (text.trim().split(/\s+/).length * 30);
    const tickInterval = setInterval(() => {
      const elapsed = (Date.now() - startTs) / 1000;
      setHumanizerElapsed(Math.round(elapsed * 10) / 10);
      const ratio = Math.min(0.92, (Date.now() - startTs) / estimatedTotalMs);
      setHumanizerProgress(Math.max(2, Math.round(ratio * 100)));
    }, 100);
    let acc = '';
    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        getEdgeFunctionUrl('ai-humanize'),
        { method: 'POST', headers, body: JSON.stringify({ text, tone: humanizerTone }) }
      );
      if (!response.ok) {
        if (response.status === 429) { toast.error('Slow down — try again in a moment'); return; }
        if (response.status === 402) { toast.error('AI credits exhausted'); return; }
        throw new Error('Humanizer failed');
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');
      let buffer = '';
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) { acc += content; setHumanizerOutput(acc); }
          } catch { buffer = line + '\n' + buffer; break; }
        }
      }
      setHumanizerProgress(100);
    } catch (e) {
      console.error(e);
      toast.error('Humanizer failed. Try again.');
    } finally {
      clearInterval(tickInterval);
      setIsHumanizing(false);
    }
  }, [humanizerInput, humanizerTone]);

  const runDetector = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? detectorInput).trim();
    if (!text) { toast.error('Paste some text first'); return; }
    if (text.length > 12000) { toast.error('Max 12000 characters'); return; }
    setIsDetecting(true);
    setDetectorResult(null);
    setDetectorProgress(5);
    setDetectorStage('Analyzing sentence rhythm…');
    // Staged fake-but-honest progress: stages match what the backend actually does
    const stages = [
      { at: 400, p: 25, label: 'Counting AI tells & repetition…' },
      { at: 1100, p: 55, label: 'Asking the AI judge…' },
      { at: 4500, p: 80, label: 'Blending detection scores…' },
      { at: 9000, p: 92, label: 'Almost done…' },
    ];
    const timers = stages.map(s => setTimeout(() => {
      setDetectorProgress(s.p);
      setDetectorStage(s.label);
    }, s.at));
    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        getEdgeFunctionUrl('ai-detect-text'),
        { method: 'POST', headers, body: JSON.stringify({ text }) }
      );
      if (!response.ok) {
        if (response.status === 429) { toast.error('Slow down — try again in a moment'); return; }
        if (response.status === 402) { toast.error('AI credits exhausted'); return; }
        throw new Error('Detector failed');
      }
      const data = await response.json();
      setDetectorProgress(100);
      setDetectorStage('Done');
      setDetectorResult(data);
    } catch (e) {
      console.error(e);
      toast.error('Detector failed. Try again.');
    } finally {
      timers.forEach(clearTimeout);
      setIsDetecting(false);
    }
  }, [detectorInput]);


  return (
    <>
      <div className="fixed inset-0 z-[100] flex flex-col bg-background">
        {/* Floating header — matches DM ChatView (two frosted-glass pills floating over content) */}
        <header
          className="absolute top-0 left-0 right-0 px-2 sm:px-3 pb-2 flex items-center gap-2 sm:gap-3 bg-transparent z-20 pointer-events-none"
          style={{ paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.75rem)' }}
        >
          {/* LEFT pill: back + avatar + name */}
          <div className="pointer-events-auto flex items-center gap-2 sm:gap-2.5 min-w-0 max-w-[68%] mr-auto pl-1.5 pr-4 py-1.5 rounded-full bg-background/40 backdrop-blur-2xl backdrop-saturate-150 border border-white/10 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/[0.04]">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/messages')}
              className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 group"
            >
              <div className="relative flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-accent to-primary opacity-60 animate-pulse" />
                <div className="absolute inset-[2px] rounded-full bg-gradient-to-br from-background via-card to-background flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-accent/20" />
                  <VybeMiniIcon size={18} showSparkles className="relative z-10 drop-shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background shadow-md shadow-green-500/50" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h2 className="font-semibold text-sm sm:text-base truncate leading-tight flex items-center gap-1.5">
                  <span className="truncate">{aiName}</span>
                  <Sparkles className="h-3 w-3 text-primary flex-shrink-0" />
                </h2>
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight truncate flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                  Active now
                  {feedDNA && <Dna className="h-2.5 w-2.5 text-accent ml-1" />}
                  {locationEnabled && <MapPin className="h-2.5 w-2.5 text-primary" />}
                </p>
              </div>
            </button>
          </div>

          {/* RIGHT pill: options */}
          <div className="pointer-events-auto flex items-center gap-0.5 px-1.5 py-1 rounded-full bg-background/40 backdrop-blur-2xl backdrop-saturate-150 border border-white/10 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/[0.04] flex-shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white/10">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                  <Settings className="h-4 w-4 mr-2" /> Customize AI
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsHumanizerOpen(true)}>
                  <Wand2 className="h-4 w-4 mr-2" /> AI Humanizer ✍️
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearChat}>Clear Chat</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-3 pb-4 space-y-3 ai-chat-messages"
          style={{ paddingTop: 'var(--app-floating-header-scroll)' }}
        >
          {messages.map((message, index) => {
            const isOwn = message.role === 'user';
            return (
              <motion.div
                key={index}
                initial={index === messages.length - 1 ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn("flex", isOwn ? 'justify-end' : 'justify-start')}
              >
                <div className="flex flex-col max-w-[78%]">
                  <div
                    className={cn(
                      'relative rounded-[20px] break-words overflow-hidden max-w-full min-w-0 w-fit',
                      'px-[14px] py-[10px] sm:px-4 sm:py-3 text-[14px] leading-relaxed',
                      isOwn
                        ? 'bg-primary text-primary-foreground rounded-br-lg'
                        : 'bg-muted/70 text-foreground rounded-bl-lg'
                    )}
                  >
                    {message.imageUrl && (
                      <img
                        src={message.imageUrl}
                        alt="Uploaded"
                        className="rounded-lg mb-1.5 max-w-full max-h-48 object-cover"
                      />
                    )}
                    {!isOwn ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-1 [&_p:last-child]:mb-0 [&_pre]:text-xs [&_code]:text-xs">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    ) : (message.content !== '📷 [Image]' ? message.content : null)}
                  </div>
                  <span
                    className={cn(
                      'text-[10px] text-muted-foreground/60 mt-1 px-1',
                      isOwn ? 'text-right' : 'text-left'
                    )}
                  >
                    {formatTime(message.timestamp)}
                  </span>
                </div>
              </motion.div>
            );
          })}

          {/* Live streaming bubble — matches DM incoming style */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex justify-start"
            >
              <div className="flex flex-col max-w-[78%]">
                <div className="relative rounded-[20px] rounded-bl-lg break-words overflow-hidden max-w-full min-w-0 w-fit px-[14px] py-[10px] sm:px-4 sm:py-3 text-[14px] leading-relaxed bg-muted/70 text-foreground">
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
                    onClick={() => handleQuickPrompt(prompt)}
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

        {/* Image preview */}
        <AnimatePresence>
          {imagePreview && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="px-3 border-t border-border/30 bg-card overflow-hidden"
            >
              <div className="py-2 flex items-center gap-2">
                <div className="relative">
                  <img src={imagePreview} alt="Selected" className="h-14 w-14 rounded-lg object-cover border border-border/40" />
                  <button
                    onClick={clearImage}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">Image attached</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="px-3 py-2.5 border-t border-border/40 bg-card shrink-0 ai-chat-composer">
          <div className="flex items-center gap-1 mb-1.5 px-1">
            {feedDNA && (
              <div className="flex items-center gap-1">
                <Dna className="h-2.5 w-2.5 text-accent" />
                <span className="text-[9px] text-accent/80">Learning your vibes</span>
              </div>
            )}
            <button
              onClick={() => { if (locationEnabled) { setLocationEnabled(false); localStorage.setItem('vybe_ai_location', 'false'); setUserLocation(null); } else { requestGPSPermission(); } }}
              className="flex items-center gap-1 ml-auto"
            >
              <div className={cn("w-1.5 h-1.5 rounded-full", locationEnabled ? "bg-green-500" : "bg-destructive")} />
              <span className={cn("text-[9px] font-medium", locationEnabled ? "text-green-500" : "text-destructive/80")}>
                Location {locationEnabled ? 'on' : 'off'}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full shrink-0 text-muted-foreground"
              onClick={() => imageInputRef.current?.click()}
              disabled={isLoading}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-9 w-9 rounded-full shrink-0", locationEnabled ? "text-green-500" : "text-muted-foreground")}
              onClick={() => { if (locationEnabled) { setLocationEnabled(false); localStorage.setItem('vybe_ai_location', 'false'); setUserLocation(null); } else { requestGPSPermission(); } }}
            >
              <MapPin className="h-4 w-4" />
            </Button>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => {
                window.setTimeout(() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }, 120);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message ${aiName}...`}
              className="flex-1 h-9 text-sm rounded-full bg-muted/40 border-border/30 px-4"
              disabled={isLoading}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={(!input.trim() && !selectedImage) || isLoading}
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
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2">
              <BotMessageSquare className="h-5 w-5 text-primary" />
              Customize Your AI
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-4 space-y-5 overflow-y-auto max-h-[calc(70vh-8rem)]">
            <div className="space-y-1.5">
              <Label htmlFor="ai-name" className="text-xs font-medium">AI Name</Label>
              <Input id="ai-name" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="VYBE-AI" maxLength={20} className="h-9" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-personality" className="text-xs font-medium">Personality</Label>
              <Textarea id="ai-personality" value={editPersonality} onChange={(e) => setEditPersonality(e.target.value)} placeholder="Describe how your AI should behave..." rows={3} maxLength={500} className="text-sm" />
            </div>

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

            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleSaveSettings} className="w-full">
                <Check className="h-4 w-4 mr-2" /> Save Changes
              </Button>
              <Button variant="outline" onClick={() => {
                setEditName('VYBE-AI');
                setEditPersonality('A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping.');
                setAiName('VYBE-AI');
                setAiPersonality('A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping.');
                localStorage.setItem(AI_NAME_KEY, 'VYBE-AI');
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

      {/* AI Humanizer + Detector Sheet */}
      <Sheet open={isHumanizerOpen} onOpenChange={setIsHumanizerOpen}>
        <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl flex flex-col p-0">
          <SheetHeader className="text-left px-4 pt-4 pb-2 border-b border-border/40">
            <SheetTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Essay Studio
              <span className="text-[10px] font-normal text-muted-foreground ml-1">humanize · detect</span>
            </SheetTitle>
            <div className="flex gap-1.5 mt-3 p-1 bg-muted/40 rounded-full">
              <button
                onClick={() => setHumanizerTab('humanize')}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                  humanizerTab === 'humanize' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                <Wand2 className="h-3.5 w-3.5" /> Humanizer
              </button>
              <button
                onClick={() => setHumanizerTab('detect')}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center justify-center gap-1.5",
                  humanizerTab === 'detect' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                <ScanLine className="h-3.5 w-3.5" /> AI Detector
              </button>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {humanizerTab === 'humanize' ? (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4 space-y-5">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/40 via-accent/30 to-primary/20 blur-2xl" />
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-xl">
                    <Wand2 className="h-10 w-10 text-primary-foreground" />
                  </div>
                </div>

                <div className="space-y-2 max-w-sm">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30">
                    <Sparkles className="h-3 w-3 text-primary" />
                    <span className="text-[11px] font-bold tracking-wider uppercase bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      VYBE Pro
                    </span>
                  </div>
                  <h3 className="text-xl font-bold">Undetectable AI Humanizer</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Rewrite any AI-generated text so it bypasses GPTZero, Turnitin, Originality.ai, and Copyleaks — while keeping every fact intact.
                  </p>
                </div>

                <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-muted/30 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="font-semibold">Coming Soon to Pro</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    We're integrating the world's most advanced humanization engine. Pro members will get unlimited access the moment it launches.
                  </p>
                </div>

                <div className="text-[10px] text-muted-foreground">
                  The free AI Detector still works — switch tabs above.
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Paste any text to scan</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {detectorInput.trim() ? `${detectorInput.trim().split(/\s+/).length} words` : '0 words'} · {detectorInput.length}/12000
                    </span>
                  </div>
                  <Textarea
                    value={detectorInput}
                    onChange={(e) => setDetectorInput(e.target.value.slice(0, 12000))}
                    placeholder="Paste any text to check if it was written by AI. Uses statistical signals (burstiness, AI tells, repetition) blended with an LLM judge — like GPTZero."
                    rows={7}
                    className="text-sm resize-none"
                  />
                </div>

                <Button
                  onClick={() => runDetector()}
                  disabled={isDetecting || !detectorInput.trim()}
                  className="w-full"
                >
                  {isDetecting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning… {detectorProgress}%</>
                  ) : (
                    <><ScanLine className="h-4 w-4 mr-2" /> Detect AI</>
                  )}
                </Button>

                {isDetecting && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary via-accent to-primary transition-all duration-300 ease-out"
                        style={{ width: `${detectorProgress}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      {detectorStage}
                    </div>
                  </div>
                )}

                {detectorResult && (
                  <div className="space-y-3 pt-1">
                    <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-card to-muted/20 p-4 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-center gap-2">
                          {detectorResult.ai_probability >= 60 ? (
                            <Bot className="h-5 w-5 text-primary" />
                          ) : (
                            <User className="h-5 w-5 text-primary" />
                          )}
                          <span className="text-sm font-semibold">{detectorResult.verdict}</span>
                        </div>
                        <span className="text-3xl font-bold tabular-nums">
                          {detectorResult.ai_probability}<span className="text-xs text-muted-foreground">%</span>
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            detectorResult.ai_probability >= 80 ? 'bg-destructive' :
                            detectorResult.ai_probability >= 60 ? 'bg-orange-500' :
                            detectorResult.ai_probability >= 40 ? 'bg-yellow-500' :
                            'bg-green-500'
                          )}
                          style={{ width: `${detectorResult.ai_probability}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground italic">{detectorResult.reason}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Burstiness', val: detectorResult.metrics.burstiness, hint: 'higher = human', raw: false },
                        { label: 'Uniformity', val: detectorResult.metrics.uniformity, hint: 'higher = AI', raw: false },
                        { label: 'AI tells', val: detectorResult.metrics.ai_tells_count, hint: 'phrases found', raw: true },
                        { label: 'Repetition', val: detectorResult.metrics.repetition, hint: 'n-gram repeats', raw: false },
                      ].map(m => (
                        <div key={m.label} className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                          <div className="text-lg font-bold tabular-nums">{m.val}{!m.raw && '%'}</div>
                          <div className="text-[10px] text-muted-foreground">{m.hint}</div>
                        </div>
                      ))}
                    </div>

                    {detectorResult.metrics.ai_tells_matched.length > 0 && (
                      <div className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-1.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">AI phrases detected</div>
                        <div className="flex flex-wrap gap-1.5">
                          {detectorResult.metrics.ai_tells_matched.map(tell => (
                            <span key={tell} className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30">
                              {tell}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {detectorResult.ai_probability >= 50 && (
                      <Button
                        variant="outline"
                        onClick={() => { setHumanizerInput(detectorInput); setHumanizerTab('humanize'); }}
                        className="w-full"
                      >
                        <Wand2 className="h-4 w-4 mr-2" /> Humanize this text
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
