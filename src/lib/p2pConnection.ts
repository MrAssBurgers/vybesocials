/**
 * P2P WebRTC Connection Module
 * 
 * Manages a direct peer-to-peer WebRTC connection for free calling.
 * Signaling is done via Supabase Realtime broadcast channels.
 * 
 * Key concepts:
 * - Uses STUN servers for NAT traversal (no TURN = truly free)
 * - Signaling channel: broadcasts SDP offers/answers and ICE candidates
 * - Reconnection: exponential backoff on ICE failure
 * - Clean interface: create, join, disconnect, toggle media
 * 
 * Bug-fix notes:
 * - Signaling channel waits for SUBSCRIBED before proceeding
 * - Reconnect timeout tracked and cleared on cleanup
 * - Double-hangup guard prevents duplicate endCall
 * - Event handler can be updated via setOnEvent to avoid stale closures
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
  | { type: 'ice-failed' };

export type P2PEventHandler = (event: P2PEvent) => void;

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'renegotiate';
  senderId: string;
  data: any;
}

// ── ICE Configuration (STUN + TURN) ────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Free TURN relay servers for NAT traversal fallback
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:relay1.expressturn.com:443',
    username: 'efPXGFATV8MWCURCOO',
    credential: 'SkwNxdXIIcMHF7vN',
  },
];

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000; // ms

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
  private hangupProcessed = false; // Guard against double hangup
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;

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

  /** Update the event handler (avoids stale closures) */
  setOnEvent(handler: P2PEventHandler): void {
    this.onEvent = handler;
  }

  /** Start the connection (caller creates offer, callee waits for offer) */
  async connect(): Promise<void> {
    if (import.meta.env.DEV) console.log('[P2P] Connecting as', this.isInitiator ? 'initiator' : 'responder');

    // 1. Get local media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.callType === 'video',
    });

    // 2. Create peer connection
    this.createPeerConnection();

    // 3. Add local tracks to peer connection
    this.localStream.getTracks().forEach(track => {
      this.pc!.addTrack(track, this.localStream!);
    });

    // 4. Setup signaling channel — WAITS for SUBSCRIBED status
    await this.setupSignaling();

    // 5. If initiator, wait a beat for the responder's channel to be ready, then send offer
    if (this.isInitiator) {
      // Small delay ensures the responder has subscribed to the channel
      await new Promise(r => setTimeout(r, 300));
      await this.createAndSendOffer();
    }
  }

  /** Disconnect and clean up everything */
  async disconnect(): Promise<void> {
    if (this.isDisconnecting) return;
    this.isDisconnecting = true;

    if (import.meta.env.DEV) console.log('[P2P] Disconnecting');

    // Notify remote via signaling
    this.sendSignal({ type: 'hangup', senderId: this.userId, data: {} });

    // Small delay to let signal propagate
    await new Promise(r => setTimeout(r, 100));

    this.cleanup();
    this.isDisconnecting = false;
  }

  /** Toggle microphone mute */
  setMicEnabled(enabled: boolean): void {
    if (!this.localStream) return;
    this.localStream.getAudioTracks().forEach(t => { t.enabled = enabled; });
  }

  /** Toggle camera on/off */
  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (!this.localStream || !this.pc) return;

    if (enabled) {
      // If no video track, acquire one and add it
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length === 0) {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        this.localStream.addTrack(videoTrack);
        this.pc.addTrack(videoTrack, this.localStream);
        // Renegotiate since we added a track
        await this.renegotiate();
      } else {
        videoTracks.forEach(t => { t.enabled = true; });
      }
    } else {
      this.localStream.getVideoTracks().forEach(t => { t.enabled = false; });
    }
  }

  /** Get the local media stream (for rendering local video) */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /** Switch audio input device */
  async switchAudioDevice(deviceId: string): Promise<void> {
    if (!this.localStream || !this.pc) return;

    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
    });

    const newTrack = newStream.getAudioTracks()[0];
    const oldTrack = this.localStream.getAudioTracks()[0];

    if (oldTrack) {
      // Replace track in peer connection
      const sender = this.pc.getSenders().find(s => s.track === oldTrack);
      if (sender) await sender.replaceTrack(newTrack);
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(newTrack);
  }

  /** Switch video input device */
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

  private createPeerConnection(): void {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // ICE candidate — send to remote via signaling
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({
          type: 'ice-candidate',
          senderId: this.userId,
          data: event.candidate.toJSON(),
        });
      }
    };

    // Remote track received
    this.pc.ontrack = (event) => {
      if (import.meta.env.DEV) console.log('[P2P] Remote track received:', event.track.kind);

      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      this.remoteStream.addTrack(event.track);

      this.onEvent({
        type: 'remote-track',
        track: event.track,
        kind: event.track.kind as 'audio' | 'video',
      });

      // Track ended handler
      event.track.onended = () => {
        this.onEvent({
          type: 'remote-track-removed',
          kind: event.track.kind as 'audio' | 'video',
        });
      };
    };

    // ICE connection state changes — key for reconnection logic
    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc?.iceConnectionState;
      if (import.meta.env.DEV) console.log('[P2P] ICE state:', iceState);

      switch (iceState) {
        case 'connected':
        case 'completed':
          this.reconnectAttempts = 0;
          if (!this.hasRemoteParticipant) {
            this.hasRemoteParticipant = true;
            this.onEvent({ type: 'remote-participant-joined' });
          }
          this.onEvent({ type: 'connected' });
          break;

        case 'disconnected':
          // Transient — may recover on its own
          if (import.meta.env.DEV) console.log('[P2P] ICE disconnected, waiting for recovery...');
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

    // Connection state change
    this.pc.onconnectionstatechange = () => {
      const connState = this.pc?.connectionState;
      if (import.meta.env.DEV) console.log('[P2P] Connection state:', connState);

      if (connState === 'failed') {
        this.attemptReconnect();
      }
    };
  }

  /** Setup Supabase Realtime signaling channel — returns Promise that resolves on SUBSCRIBED */
  private setupSignaling(): Promise<void> {
    return new Promise((resolve, reject) => {
      const channelName = `p2p-signal:${this.conversationId}`;

      this.signalingChannel = supabase.channel(channelName, {
        config: { broadcast: { self: false } },
      });

      this.signalingChannel
        .on('broadcast', { event: 'signal' }, async (payload) => {
          const message = payload.payload as SignalMessage;
          // Ignore our own messages
          if (message.senderId === this.userId) return;
          await this.handleSignalMessage(message);
        })
        .subscribe((status) => {
          if (import.meta.env.DEV) console.log('[P2P] Signaling channel status:', status);
          if (status === 'SUBSCRIBED') {
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Signaling channel failed: ${status}`));
          }
        });
    });
  }

  /** Handle incoming signaling messages */
  private async handleSignalMessage(message: SignalMessage): Promise<void> {
    if (!this.pc) return;

    switch (message.type) {
      case 'offer': {
        if (import.meta.env.DEV) console.log('[P2P] Received offer');
        await this.pc.setRemoteDescription(new RTCSessionDescription(message.data));
        this.hasRemoteDescription = true;
        await this.flushIceCandidates();

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({
          type: 'answer',
          senderId: this.userId,
          data: answer,
        });
        break;
      }

      case 'answer': {
        if (import.meta.env.DEV) console.log('[P2P] Received answer');
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
            if (import.meta.env.DEV) console.warn('[P2P] Failed to add ICE candidate:', err);
          }
        } else {
          // Queue ICE candidates until remote description is set
          this.iceCandidateQueue.push(message.data);
        }
        break;
      }

      case 'hangup': {
        // Guard against double hangup processing
        if (this.hangupProcessed) return;
        this.hangupProcessed = true;

        if (import.meta.env.DEV) console.log('[P2P] Remote hangup received');
        this.hasRemoteParticipant = false;
        this.onEvent({ type: 'remote-participant-left' });
        this.onEvent({ type: 'disconnected', reason: 'remote-hangup' });
        break;
      }

      case 'renegotiate': {
        // Remote wants to renegotiate (e.g. added video track)
        if (import.meta.env.DEV) console.log('[P2P] Renegotiation requested');
        // The offer will come as a separate 'offer' message
        break;
      }
    }
  }

  /** Flush queued ICE candidates after remote description is set */
  private async flushIceCandidates(): Promise<void> {
    if (!this.pc) return;
    for (const candidate of this.iceCandidateQueue) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[P2P] Failed to add queued ICE candidate:', err);
      }
    }
    this.iceCandidateQueue = [];
  }

  /** Create and send SDP offer */
  private async createAndSendOffer(): Promise<void> {
    if (!this.pc) return;

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.sendSignal({
      type: 'offer',
      senderId: this.userId,
      data: offer,
    });
  }

  /** Send a signal message via broadcast */
  private sendSignal(message: SignalMessage): void {
    if (!this.signalingChannel) return;
    this.signalingChannel.send({
      type: 'broadcast',
      event: 'signal',
      payload: message,
    });
  }

  /** Renegotiate (e.g. when adding/removing tracks) */
  private async renegotiate(): Promise<void> {
    if (!this.pc || !this.isInitiator) return;
    this.sendSignal({ type: 'renegotiate', senderId: this.userId, data: {} });
    await this.createAndSendOffer();
  }

  /** Attempt reconnection with exponential backoff */
  private attemptReconnect(): void {
    if (this.isDisconnecting) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      if (import.meta.env.DEV) console.log('[P2P] Max reconnect attempts reached');
      this.onEvent({ type: 'ice-failed' });
      return;
    }

    this.reconnectAttempts++;
    const delay = RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts - 1);

    if (import.meta.env.DEV) console.log(`[P2P] Reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
    this.onEvent({ type: 'reconnecting', attempt: this.reconnectAttempts });

    // Store timeout so we can clear it on cleanup
    this.reconnectTimeoutId = setTimeout(async () => {
      this.reconnectTimeoutId = null;
      if (this.isDisconnecting) return;

      // ICE restart
      try {
        if (this.pc && this.isInitiator) {
          const offer = await this.pc.createOffer({ iceRestart: true });
          await this.pc.setLocalDescription(offer);
          this.sendSignal({
            type: 'offer',
            senderId: this.userId,
            data: offer,
          });
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('[P2P] Reconnect failed:', err);
      }
    }, delay);
  }

  /** Clean up all resources */
  private cleanup(): void {
    // Clear reconnect timeout to prevent memory leak
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    // Stop local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }

    // Remove signaling channel
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
  }
}
