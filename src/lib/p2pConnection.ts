/**
 * P2P WebRTC Connection Module — v2 (Reliable)
 * 
 * Key improvements over v1:
 * - Ready-signal handshake: responder broadcasts 'ready' when subscribed,
 *   initiator waits for it before sending offer (eliminates race condition)
 * - Offer retransmission: re-sends offer every 2s until answer received (up to 5x)
 * - Reliable TURN: uses global.relay.metered.ca free tier
 * - Emits 'ice-failed' with attempt count for auto-fallback
 */

import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────

export type P2PEvent = 
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'reconnecting'; attempt: number }
  | { type: 'remote-track'; track: MediaStreamTrack; kind: 'audio' | 'video' }
  | { type: 'remote-track-removed'; kind: 'audio' | 'video' }
  | { type: 'remote-participant-joined' }
  | { type: 'remote-participant-left' }
  | { type: 'ice-failed' }
  | { type: 'timeout' };

export type P2PEventHandler = (event: P2PEvent) => void;

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'renegotiate' | 'ready';
  senderId: string;
  data: any;
}

// ── ICE Configuration ──────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  // Free TURN relay (global.relay.metered.ca free-tier — more reliable than openrelay)
  {
    urls: [
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:80?transport=tcp',
      'turn:global.relay.metered.ca:443',
      'turn:global.relay.metered.ca:443?transport=tcp',
    ],
    username: 'e8dd65b92f70a38b170bf067',
    credential: 'xhN/n1Do2GFefVyl',
  },
];

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY = 1000;
const OFFER_RETRANSMIT_INTERVAL = 2000;
const MAX_OFFER_RETRANSMITS = 5;
const READY_SIGNAL_TIMEOUT = 3000; // Fallback: send offer anyway after 3s

// ── P2P Connection Class ───────────────────────────────────────

export class P2PConnection {
  private pc: RTCPeerConnection | null = null;
  private signalingChannel: RealtimeChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private conversationId: string;
  private userId: string;
  private isInitiator: boolean;
  private callType: 'audio' | 'video';
  private onEvent: P2PEventHandler;
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isDisconnecting = false;
  private hasRemoteParticipant = false;
  private hangupProcessed = false;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;
  private answerReceived = false;
  private offerRetransmitTimer: ReturnType<typeof setInterval> | null = null;
  private readyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(params: {
    conversationId: string;
    userId: string;
    isInitiator: boolean;
    callType: 'audio' | 'video';
    onEvent: P2PEventHandler;
  }) {
    this.conversationId = params.conversationId;
    this.userId = params.userId;
    this.isInitiator = params.isInitiator;
    this.callType = params.callType;
    this.onEvent = params.onEvent;
  }

  // ── Public API ─────────────────────────────────────────────

  setOnEvent(handler: P2PEventHandler): void {
    this.onEvent = handler;
  }

  async connect(): Promise<void> {
    console.log('[P2P] Connecting as', this.isInitiator ? 'initiator' : 'responder');

    // 1. Get local media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.callType === 'video',
    });

    // 2. Create peer connection
    this.createPeerConnection();

    // 3. Add local tracks
    this.localStream.getTracks().forEach(track => {
      this.pc!.addTrack(track, this.localStream!);
    });

    // 4. Setup signaling channel — waits for SUBSCRIBED
    await this.setupSignaling();

    // 5. Role-based handshake
    if (this.isInitiator) {
      // Wait for 'ready' signal from responder, with fallback timeout
      console.log('[P2P] Initiator: waiting for ready signal...');
      await this.waitForReadySignal();
      await this.createAndSendOffer();
      this.startOfferRetransmission();
    } else {
      // Responder: broadcast 'ready' immediately after subscribing
      console.log('[P2P] Responder: sending ready signal');
      this.sendSignal({ type: 'ready', senderId: this.userId, data: {} });
    }
  }

  async disconnect(): Promise<void> {
    if (this.isDisconnecting) return;
    this.isDisconnecting = true;
    console.log('[P2P] Disconnecting');

    this.sendSignal({ type: 'hangup', senderId: this.userId, data: {} });
    await new Promise(r => setTimeout(r, 100));
    this.cleanup();
    this.isDisconnecting = false;
  }

  setMicEnabled(enabled: boolean): void {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (!this.localStream || !this.pc) return;

    if (enabled) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length === 0) {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        this.localStream.addTrack(videoTrack);
        this.pc.addTrack(videoTrack, this.localStream);
        await this.renegotiate();
      } else {
        videoTracks.forEach(t => { t.enabled = true; });
      }
    } else {
      this.localStream.getVideoTracks().forEach(t => { t.enabled = false; });
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  async switchAudioDevice(deviceId: string): Promise<void> {
    if (!this.localStream || !this.pc) return;
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
    });
    const newTrack = newStream.getAudioTracks()[0];
    const oldTrack = this.localStream.getAudioTracks()[0];
    if (oldTrack) {
      const sender = this.pc.getSenders().find(s => s.track === oldTrack);
      if (sender) await sender.replaceTrack(newTrack);
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(newTrack);
  }

  async switchVideoDevice(deviceId: string): Promise<void> {
    if (!this.localStream || !this.pc) return;
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
    });
    const newTrack = newStream.getVideoTracks()[0];
    const oldTrack = this.localStream.getVideoTracks()[0];
    if (oldTrack) {
      const sender = this.pc.getSenders().find(s => s.track === oldTrack);
      if (sender) await sender.replaceTrack(newTrack);
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(newTrack);
  }

  // ── Private Methods ────────────────────────────────────────

  /** Wait for the responder to send a 'ready' signal, with timeout fallback */
  private waitForReadySignal(): Promise<void> {
    return new Promise((resolve) => {
      // If we already got the ready signal (via handleSignalMessage), resolve
      // We use a flag set in handleSignalMessage
      if ((this as any)._readyReceived) {
        resolve();
        return;
      }
      
      (this as any)._readyResolve = resolve;
      
      // Fallback: if no ready signal within timeout, proceed anyway
      this.readyTimeoutId = setTimeout(() => {
        console.log('[P2P] Ready signal timeout — sending offer anyway');
        (this as any)._readyResolve = null;
        resolve();
      }, READY_SIGNAL_TIMEOUT);
    });
  }

  /** Start periodic offer retransmission until answer is received */
  private startOfferRetransmission(): void {
    let retransmitCount = 0;
    this.offerRetransmitTimer = setInterval(async () => {
      if (this.answerReceived || this.isDisconnecting || !this.pc) {
        this.stopOfferRetransmission();
        return;
      }
      retransmitCount++;
      if (retransmitCount >= MAX_OFFER_RETRANSMITS) {
        console.log('[P2P] Max offer retransmits reached');
        this.stopOfferRetransmission();
        this.onEvent({ type: 'timeout' });
        return;
      }
      console.log(`[P2P] Retransmitting offer (${retransmitCount}/${MAX_OFFER_RETRANSMITS})`);
      await this.createAndSendOffer();
    }, OFFER_RETRANSMIT_INTERVAL);
  }

  private stopOfferRetransmission(): void {
    if (this.offerRetransmitTimer) {
      clearInterval(this.offerRetransmitTimer);
      this.offerRetransmitTimer = null;
    }
  }

  private createPeerConnection(): void {
    this.pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 4,
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          senderId: this.userId,
          data: event.candidate.toJSON(),
        });
      }
    };

    this.pc.ontrack = (event) => {
      console.log('[P2P] Remote track received:', event.track.kind);
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      this.remoteStream.addTrack(event.track);
      this.onEvent({
        type: 'remote-track',
        track: event.track,
        kind: event.track.kind as 'audio' | 'video',
      });
      event.track.onended = () => {
        this.onEvent({
          type: 'remote-track-removed',
          kind: event.track.kind as 'audio' | 'video',
        });
      };
    };

    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc?.iceConnectionState;
      console.log('[P2P] ICE state:', iceState);

      switch (iceState) {
        case 'connected':
        case 'completed':
          this.reconnectAttempts = 0;
          this.stopOfferRetransmission();
          if (!this.hasRemoteParticipant) {
            this.hasRemoteParticipant = true;
            this.onEvent({ type: 'remote-participant-joined' });
          }
          this.onEvent({ type: 'connected' });
          break;

        case 'disconnected':
          console.log('[P2P] ICE disconnected, waiting for recovery...');
          break;

        case 'failed':
          this.onEvent({ type: 'ice-failed' });
          this.attemptReconnect();
          break;

        case 'closed':
          if (!this.isDisconnecting && !this.hangupProcessed) {
            if (this.hasRemoteParticipant) {
              this.hasRemoteParticipant = false;
              this.onEvent({ type: 'remote-participant-left' });
            }
            this.onEvent({ type: 'disconnected' });
          }
          break;
      }
    };

    this.pc.onconnectionstatechange = () => {
      const connState = this.pc?.connectionState;
      console.log('[P2P] Connection state:', connState);
      if (connState === 'failed') {
        this.attemptReconnect();
      }
    };
  }

  private setupSignaling(): Promise<void> {
    return new Promise((resolve, reject) => {
      const channelName = `p2p-signal:${this.conversationId}`;

      this.signalingChannel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      this.signalingChannel
        .on('broadcast', { event: 'signal' }, async (payload) => {
          const message = payload.payload as SignalMessage;
          if (message.senderId === this.userId) return;
          await this.handleSignalMessage(message);
        })
        .subscribe((status) => {
          console.log('[P2P] Signaling channel status:', status);
          if (status === 'SUBSCRIBED') {
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Signaling channel failed: ${status}`));
          }
        });
    });
  }

  private async handleSignalMessage(message: SignalMessage): Promise<void> {
    if (message.type === 'ready') {
      console.log('[P2P] Received ready signal from responder');
      (this as any)._readyReceived = true;
      // Resolve the waitForReadySignal promise if it's waiting
      if ((this as any)._readyResolve) {
        if (this.readyTimeoutId) {
          clearTimeout(this.readyTimeoutId);
          this.readyTimeoutId = null;
        }
        const resolve = (this as any)._readyResolve;
        (this as any)._readyResolve = null;
        resolve();
      }
      return;
    }

    if (!this.pc) return;

    switch (message.type) {
      case 'offer': {
        console.log('[P2P] Received offer');
        // If we already have a remote description, handle re-offers gracefully
        if (this.hasRemoteDescription) {
          await this.pc.setRemoteDescription(new RTCSessionDescription(message.data));
          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          this.sendSignal({ type: 'answer', senderId: this.userId, data: answer });
          return;
        }
        await this.pc.setRemoteDescription(new RTCSessionDescription(message.data));
        this.hasRemoteDescription = true;
        await this.flushIceCandidates();

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({ type: 'answer', senderId: this.userId, data: answer });
        break;
      }

      case 'answer': {
        console.log('[P2P] Received answer');
        this.answerReceived = true;
        this.stopOfferRetransmission();
        await this.pc.setRemoteDescription(new RTCSessionDescription(message.data));
        this.hasRemoteDescription = true;
        await this.flushIceCandidates();
        break;
      }

      case 'ice-candidate': {
        if (this.hasRemoteDescription) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(message.data));
          } catch (err) {
            console.warn('[P2P] Failed to add ICE candidate:', err);
          }
        } else {
          this.iceCandidateQueue.push(message.data);
        }
        break;
      }

      case 'hangup': {
        if (this.hangupProcessed) return;
        this.hangupProcessed = true;
        console.log('[P2P] Remote hangup received');
        this.hasRemoteParticipant = false;
        this.onEvent({ type: 'remote-participant-left' });
        this.onEvent({ type: 'disconnected', reason: 'remote-hangup' });
        break;
      }

      case 'renegotiate': {
        console.log('[P2P] Renegotiation requested');
        break;
      }
    }
  }

  private async flushIceCandidates(): Promise<void> {
    if (!this.pc) return;
    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[P2P] Failed to add queued ICE candidate:', err);
      }
    }
    this.iceCandidateQueue = [];
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.pc) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ type: 'offer', senderId: this.userId, data: offer });
  }

  private sendSignal(message: SignalMessage): void {
    if (!this.signalingChannel) return;
    this.signalingChannel.send({
      type: 'broadcast',
      event: 'signal',
      payload: message,
    });
  }

  private async renegotiate(): Promise<void> {
    if (!this.pc || !this.isInitiator) return;
    this.sendSignal({ type: 'renegotiate', senderId: this.userId, data: {} });
    await this.createAndSendOffer();
  }

  private attemptReconnect(): void {
    if (this.isDisconnecting) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[P2P] Max reconnect attempts reached');
      this.onEvent({ type: 'ice-failed' });
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`[P2P] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    this.onEvent({ type: 'reconnecting', attempt: this.reconnectAttempts });

    this.reconnectTimeoutId = setTimeout(async () => {
      this.reconnectTimeoutId = null;
      if (this.isDisconnecting) return;

      try {
        if (this.pc && this.isInitiator) {
          const offer = await this.pc.createOffer({ iceRestart: true });
          await this.pc.setLocalDescription(offer);
          this.sendSignal({ type: 'offer', senderId: this.userId, data: offer });
        }
      } catch (err) {
        console.error('[P2P] Reconnect failed:', err);
      }
    }, delay);
  }

  private cleanup(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.readyTimeoutId) {
      clearTimeout(this.readyTimeoutId);
      this.readyTimeoutId = null;
    }
    this.stopOfferRetransmission();

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }

    if (this.signalingChannel) {
      supabase.removeChannel(this.signalingChannel);
      this.signalingChannel = null;
    }

    this.remoteStream = null;
    this.hasRemoteParticipant = false;
    this.hasRemoteDescription = false;
    this.iceCandidateQueue = [];
    this.reconnectAttempts = 0;
    this.hangupProcessed = false;
    this.answerReceived = false;
    (this as any)._readyReceived = false;
    (this as any)._readyResolve = null;
  }
}
