/**
 * P2P WebRTC Connection Module — v3 (Reliable + HD + Linger)
 * 
 * Key improvements:
 * - Ready-signal handshake: responder broadcasts 'ready' when subscribed
 * - Cached SDP offer: retransmits the same offer instead of recreating
 * - HD audio constraints: echoCancellation, noiseSuppression, autoGainControl
 * - HD video constraints: 1080p target, 720p min, adaptive downgrade
 * - Signaling keepalive: 25s ping to prevent Realtime channel staleness
 * - Hangup-only mode: send hangup without cleanup (for linger support)
 */

import { db } from '@/lib/firebase';
import type { RealtimeChannel } from '@/lib/firebase/realtimeService';
import { stopCameraStream } from '@/hooks/useCameraPreload';

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
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup' | 'renegotiate' | 'ready' | 'ping';
  senderId: string;
  data: any;
}

// ── ICE Configuration ──────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
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
const MAX_OFFER_RETRANSMITS = 10;
const READY_SIGNAL_TIMEOUT = 5000;
const KEEPALIVE_INTERVAL = 25000; // 25s keepalive ping

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
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private cachedOffer: RTCSessionDescriptionInit | null = null;

  private onLocalStream?: (stream: MediaStream) => void;

  constructor(params: {
    conversationId: string;
    userId: string;
    isInitiator: boolean;
    callType: 'audio' | 'video';
    onEvent: P2PEventHandler;
    onLocalStream?: (stream: MediaStream) => void;
  }) {
    this.conversationId = params.conversationId;
    this.userId = params.userId;
    this.isInitiator = params.isInitiator;
    this.callType = params.callType;
    this.onEvent = params.onEvent;
    this.onLocalStream = params.onLocalStream;
  }

  // ── Public API ─────────────────────────────────────────────

  setOnEvent(handler: P2PEventHandler): void {
    this.onEvent = handler;
  }

  /** Callee-only: join signaling and show caller's live camera before answering (Snapchat-style). */
  async connectPreview(): Promise<void> {
    if (this.isInitiator) {
      throw new Error('Preview connect is for incoming callee only');
    }
    console.log('[P2P] Preview connect — receive-only until accept');
    stopCameraStream();
    await this.setupSignaling();
    this.createPeerConnection();
    this.pc!.addTransceiver('audio', { direction: 'recvonly' });
    this.pc!.addTransceiver('video', { direction: 'recvonly' });
    this.startKeepalive();
    this.sendSignal({ type: 'ready', senderId: this.userId, data: {} });
  }

  /** After preview accept — attach mic/camera and renegotiate. */
  async attachLocalMedia(): Promise<void> {
    if (!this.pc) throw new Error('No peer connection');
    if (this.localStream) return;

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };
    const videoConstraints: MediaTrackConstraints | boolean = this.callType === 'video'
      ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } }
      : false;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: videoConstraints,
    });
    this.localStream = stream;
    stream.getTracks().forEach((track) => this.pc!.addTrack(track, stream));
    try { this.onLocalStream?.(stream); } catch {}

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ type: 'offer', senderId: this.userId, data: offer });
  }

  async connect(): Promise<void> {
    console.log('[P2P] Connecting as', this.isInitiator ? 'initiator' : 'responder');

    // 0. Release any existing camera stream (e.g. from VybeSnapCamera).
    //    Tracks are stopped synchronously — no artificial wait needed.
    stopCameraStream();
    // Wait out overlapping post/create camera acquire (WebView crash guard).
    if (typeof window !== 'undefined') {
      const { isAcquiringPostCamera } = await import('@/lib/postCameraStream');
      for (let i = 0; i < 20 && isAcquiringPostCamera(); i += 1) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    // Defensive: if a prior call left a localStream on this instance, stop it
    // before requesting new tracks (Android WebViews crash on duplicate gUM).
    if (this.localStream) {
      try { this.localStream.getTracks().forEach((t) => t.stop()); } catch {}
      this.localStream = null;
    }

    // 1. Build constraints. Start at SD for FAST camera open on mobile;
    //    we can upgrade to HD via applyConstraints after the call connects.
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    };

    const videoConstraints: MediaTrackConstraints | boolean = this.callType === 'video'
      ? {
          facingMode: 'user',
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, max: 30 },
        }
      : false;

    // Despia/old-Android still needs staged init to avoid hard crashes.
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isDespia = /despia|vybeapp/i.test(ua);
    const isOldAndroid = /Android\s([0-9]|10|11)\b/i.test(ua);
    const useStaged = (isDespia || isOldAndroid) && this.callType === 'video';

    // 2. Kick off getUserMedia and signaling subscription IN PARALLEL.
    //    This is the biggest single win: today they run sequentially, so the
    //    user waits ~Realtime-RTT longer than necessary before camera shows.
    const signalingPromise = this.setupSignaling();

    // Guard: WebView/older Android can lack mediaDevices entirely. Fail fast
    // with a clear message instead of a TypeError that crashes the overlay.
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const msg = 'Microphone/Camera not available on this device';
      this.onEvent({ type: 'disconnected', reason: msg });
      throw new Error(msg);
    }

    const mediaPromise: Promise<MediaStream> = (async () => {
      try {
        if (useStaged) {
          console.log('[P2P] Despia/Android detected — staged audio-first init');
          const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          try {
            const videoOnly = await navigator.mediaDevices.getUserMedia({ video: videoConstraints as MediaTrackConstraints });
            videoOnly.getVideoTracks().forEach(t => stream.addTrack(t));
          } catch (videoErr: any) {
            console.warn('[P2P] Staged video upgrade failed, continuing audio-only:', videoErr?.message);
          }
          return stream;
        }
        return await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: videoConstraints,
        });
      } catch (mediaErr: any) {
        console.error('[P2P] getUserMedia failed:', mediaErr.name, mediaErr.message);
        if (mediaErr.name === 'NotAllowedError' || mediaErr.name === 'NotReadableError' || mediaErr.name === 'OverconstrainedError') {
          try {
            console.log('[P2P] Retrying with simple constraints...');
            return await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: this.callType === 'video',
            });
          } catch (retryErr: any) {
            console.error('[P2P] Retry also failed:', retryErr.name, retryErr.message);
            if (this.callType === 'video') {
              try {
                return await navigator.mediaDevices.getUserMedia({ audio: true });
              } catch (audioErr: any) {
                this.onEvent({ type: 'disconnected', reason: `Media access failed: ${audioErr.message}` });
                throw audioErr;
              }
            } else {
              this.onEvent({ type: 'disconnected', reason: `Media access failed: ${retryErr.message}` });
              throw retryErr;
            }
          }
        }
        this.onEvent({ type: 'disconnected', reason: `Media access failed: ${mediaErr.message}` });
        throw mediaErr;
      }
    })();

    // Notify overlay the moment local media is ready (don't wait on signaling).
    mediaPromise.then(stream => {
      this.localStream = stream;
      console.log('[P2P] Got local media:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', '));
      try { this.onLocalStream?.(stream); } catch {}
    }).catch(() => { /* error path already reported via onEvent */ });

    // 3. Wait for both to be ready before continuing
    const [stream] = await Promise.all([mediaPromise, signalingPromise]);
    this.localStream = stream;

    // 4. Create peer connection + add tracks
    this.createPeerConnection();
    this.localStream.getTracks().forEach(track => {
      this.pc!.addTrack(track, this.localStream!);
    });

    // 5. Start keepalive
    this.startKeepalive();

    // 6. Role-based handshake
    if (this.isInitiator) {
      console.log('[P2P] Initiator: waiting for ready signal...');
      await this.waitForReadySignal();
      await this.createAndCacheOffer();
      this.sendCachedOffer();
      this.startOfferRetransmission();
    } else {
      console.log('[P2P] Responder: sending ready signal');
      this.sendSignal({ type: 'ready', senderId: this.userId, data: {} });
    }
  }

  /** Send hangup signal without cleaning up local resources (for linger support) */
  sendHangupOnly(): void {
    console.log('[P2P] Sending hangup signal (linger mode — keeping local resources)');
    this.sendSignal({ type: 'hangup', senderId: this.userId, data: {} });
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
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
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

  /** Bump capture resolution after ICE connects — avoids slow camera open on mobile. */
  private async upgradeVideoQualityIfPossible(): Promise<void> {
    if (this.callType !== 'video' || !this.localStream) return;
    const track = this.localStream.getVideoTracks()[0];
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        frameRate: { ideal: 30, max: 30 },
      });
    } catch (err) {
      console.warn('[P2P] HD upgrade skipped:', (err as Error)?.message);
    }
  }

  async switchAudioDevice(deviceId: string): Promise<void> {
    if (!this.localStream || !this.pc) return;
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
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
      if ((this as any)._readyReceived) {
        resolve();
        return;
      }
      
      (this as any)._readyResolve = resolve;
      
      this.readyTimeoutId = setTimeout(() => {
        console.log('[P2P] Ready signal timeout — sending offer anyway');
        (this as any)._readyResolve = null;
        resolve();
      }, READY_SIGNAL_TIMEOUT);
    });
  }

  /** Create and cache the SDP offer (called once) */
  private async createAndCacheOffer(): Promise<void> {
    if (!this.pc) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.cachedOffer = offer;
    console.log('[P2P] Offer created and cached');
  }

  /** Send the cached offer (no SDP recreation) */
  private sendCachedOffer(): void {
    if (!this.cachedOffer) return;
    this.sendSignal({ type: 'offer', senderId: this.userId, data: this.cachedOffer });
  }

  /** Start periodic retransmission of the cached offer */
  private startOfferRetransmission(): void {
    let retransmitCount = 0;
    this.offerRetransmitTimer = setInterval(() => {
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
      console.log(`[P2P] Retransmitting cached offer (${retransmitCount}/${MAX_OFFER_RETRANSMITS})`);
      this.sendCachedOffer();
    }, OFFER_RETRANSMIT_INTERVAL);
  }

  private stopOfferRetransmission(): void {
    if (this.offerRetransmitTimer) {
      clearInterval(this.offerRetransmitTimer);
      this.offerRetransmitTimer = null;
    }
  }

  /** Start keepalive pings to prevent Realtime channel from going stale */
  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      if (this.signalingChannel && !this.isDisconnecting) {
        this.sendSignal({ type: 'ping', senderId: this.userId, data: {} });
      }
    }, KEEPALIVE_INTERVAL);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
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
          void this.upgradeVideoQualityIfPossible();
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

      this.signalingChannel = db.channel(channelName, {
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
    // Ignore keepalive pings
    if (message.type === 'ping') return;

    if (message.type === 'ready') {
      console.log('[P2P] Received ready signal from responder');
      (this as any)._readyReceived = true;
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
        console.log('[P2P] Received offer, signalingState:', this.pc.signalingState);
        if (this.hasRemoteDescription) {
          // Guard: only re-negotiate if not already stable with no pending ops
          if (this.pc.signalingState === 'stable') {
            console.log('[P2P] Re-negotiation offer in stable state');
          }
          try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(message.data));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            this.sendSignal({ type: 'answer', senderId: this.userId, data: answer });
          } catch (err) {
            console.warn('[P2P] Failed to handle re-offer:', err);
          }
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
        console.log('[P2P] Received answer, signalingState:', this.pc.signalingState);
        // Guard: only set remote answer when in 'have-local-offer' state
        if (this.pc.signalingState !== 'have-local-offer') {
          console.warn('[P2P] Ignoring answer — wrong signalingState:', this.pc.signalingState);
          break;
        }
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

  private sendSignal(message: SignalMessage): void {
    if (!this.signalingChannel) return;
    void this.signalingChannel.send({
      type: 'broadcast',
      event: 'signal',
      payload: message,
    }).catch((err) => {
      console.warn('[P2P] Signal send failed:', err);
    });
  }

  private async renegotiate(): Promise<void> {
    if (!this.pc || !this.isInitiator) return;
    this.sendSignal({ type: 'renegotiate', senderId: this.userId, data: {} });
    // For renegotiation we DO need a new offer (not the cached one)
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ type: 'offer', senderId: this.userId, data: offer });
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
    this.stopKeepalive();

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
      db.removeChannel(this.signalingChannel);
      this.signalingChannel = null;
    }

    this.remoteStream = null;
    this.hasRemoteParticipant = false;
    this.hasRemoteDescription = false;
    this.iceCandidateQueue = [];
    this.reconnectAttempts = 0;
    this.hangupProcessed = false;
    this.answerReceived = false;
    this.cachedOffer = null;
    (this as any)._readyReceived = false;
    (this as any)._readyResolve = null;
  }
}
