import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Native FriendDrop Plugin Interface
 * Uses Multipeer Connectivity (iOS) / Nearby Connections (Android)
 * for true peer-to-peer discovery like Apple's NameDrop
 */

export interface NearbyUser {
  peerId: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface FriendDropPlugin {
  /**
   * Check if native peer discovery is available
   */
  isAvailable(): Promise<{ available: boolean }>;
  
  /**
   * Start advertising this device to nearby peers
   */
  startAdvertising(options: {
    userId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  }): Promise<void>;
  
  /**
   * Stop advertising
   */
  stopAdvertising(): Promise<void>;
  
  /**
   * Start browsing for nearby peers
   */
  startBrowsing(): Promise<void>;
  
  /**
   * Stop browsing
   */
  stopBrowsing(): Promise<void>;
  
  /**
   * Accept connection from a peer
   */
  acceptPeer(options: { peerId: string }): Promise<void>;
  
  /**
   * Reject connection from a peer
   */
  rejectPeer(options: { peerId: string }): Promise<void>;
  
  /**
   * Add listener for peer discovery events
   */
  addListener(
    eventName: 'peerFound',
    listenerFunc: (data: { peer: NearbyUser }) => void
  ): Promise<{ remove: () => void }>;
  
  addListener(
    eventName: 'peerLost',
    listenerFunc: (data: { peerId: string }) => void
  ): Promise<{ remove: () => void }>;
  
  addListener(
    eventName: 'peerConnected',
    listenerFunc: (data: { peer: NearbyUser }) => void
  ): Promise<{ remove: () => void }>;
  
  addListener(
    eventName: 'connectionFailed',
    listenerFunc: (data: { peerId: string; error: string }) => void
  ): Promise<{ remove: () => void }>;
  
  /**
   * Remove all listeners
   */
  removeAllListeners(): Promise<void>;
}

// Register the plugin - will be implemented natively
const FriendDropNative = registerPlugin<FriendDropPlugin>('FriendDrop', {
  web: () => import('./nativeFriendDropWeb').then(m => new m.FriendDropWeb()),
});

/**
 * Check if we're running as a native app with FriendDrop support
 */
export const isNativeFriendDropAvailable = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }
  
  try {
    const { available } = await FriendDropNative.isAvailable();
    return available;
  } catch {
    return false;
  }
};

/**
 * Hook-friendly wrapper for native FriendDrop
 */
export class NativeFriendDropService {
  private listeners: Array<{ remove: () => void }> = [];
  private isAdvertising = false;
  private isBrowsing = false;
  
  async startSession(user: {
    userId: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  }): Promise<void> {
    // Start both advertising and browsing for bidirectional discovery
    await Promise.all([
      FriendDropNative.startAdvertising(user),
      FriendDropNative.startBrowsing(),
    ]);
    this.isAdvertising = true;
    this.isBrowsing = true;
  }
  
  async stopSession(): Promise<void> {
    if (this.isAdvertising) {
      await FriendDropNative.stopAdvertising();
      this.isAdvertising = false;
    }
    if (this.isBrowsing) {
      await FriendDropNative.stopBrowsing();
      this.isBrowsing = false;
    }
  }
  
  async onPeerFound(callback: (peer: NearbyUser) => void): Promise<void> {
    const listener = await FriendDropNative.addListener('peerFound', ({ peer }) => {
      callback(peer);
    });
    this.listeners.push(listener);
  }
  
  async onPeerLost(callback: (peerId: string) => void): Promise<void> {
    const listener = await FriendDropNative.addListener('peerLost', ({ peerId }) => {
      callback(peerId);
    });
    this.listeners.push(listener);
  }
  
  async onPeerConnected(callback: (peer: NearbyUser) => void): Promise<void> {
    const listener = await FriendDropNative.addListener('peerConnected', ({ peer }) => {
      callback(peer);
    });
    this.listeners.push(listener);
  }
  
  async acceptPeer(peerId: string): Promise<void> {
    await FriendDropNative.acceptPeer({ peerId });
  }
  
  async cleanup(): Promise<void> {
    await this.stopSession();
    for (const listener of this.listeners) {
      listener.remove();
    }
    this.listeners = [];
    await FriendDropNative.removeAllListeners();
  }
}

export { FriendDropNative };
