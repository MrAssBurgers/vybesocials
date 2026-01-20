import { WebPlugin } from '@capacitor/core';
import type { FriendDropPlugin } from './nativeFriendDrop';

/**
 * Web fallback for FriendDrop plugin
 * Returns not available on web - use QR code fallback instead
 */
export class FriendDropWeb extends WebPlugin implements FriendDropPlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    // Native peer discovery not available on web
    return { available: false };
  }
  
  async startAdvertising(): Promise<void> {
    throw new Error('FriendDrop native peer discovery is not available on web');
  }
  
  async stopAdvertising(): Promise<void> {
    // No-op on web
  }
  
  async startBrowsing(): Promise<void> {
    throw new Error('FriendDrop native peer discovery is not available on web');
  }
  
  async stopBrowsing(): Promise<void> {
    // No-op on web
  }
  
  async acceptPeer(): Promise<void> {
    throw new Error('FriendDrop native peer discovery is not available on web');
  }
  
  async rejectPeer(): Promise<void> {
    throw new Error('FriendDrop native peer discovery is not available on web');
  }
}
