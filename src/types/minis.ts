/**
 * VYBE Minis - Mini Apps Platform Types
 * 
 * This is the foundation for a Roblox-like mini apps system.
 * Currently hidden behind feature flag, not exposed to users.
 */

// Permissions a mini can request
export type MiniPermission = 
  | 'camera'       // Access device camera
  | 'microphone'   // Access device microphone  
  | 'contacts'     // Access user's friend list
  | 'notifications' // Send push notifications
  | 'location'     // Access device location
  | 'storage';     // Store data locally

// Mini app manifest - defines metadata and capabilities
export interface MiniManifest {
  // Unique identifier (e.g., "com.vybe.minigame")
  id: string;
  
  // Display name shown to users
  name: string;
  
  // Short description (max 100 chars)
  description: string;
  
  // Icon URL (256x256 recommended)
  icon: string;
  
  // Author information
  author: {
    id: string;      // User ID of creator
    name: string;    // Display name
  };
  
  // Semantic version (e.g., "1.0.0")
  version: string;
  
  // Entry route within the mini (relative path)
  entry: string;
  
  // Permissions the mini requires
  permissions: MiniPermission[];
  
  // Optional: Categories for discovery
  categories?: string[];
  
  // Optional: Screenshots for store listing
  screenshots?: string[];
  
  // Optional: Background color for loading
  backgroundColor?: string;
  
  // Optional: Minimum VYBE version required
  minAppVersion?: string;
}

// Runtime state for an active mini
export interface MiniRuntime {
  manifest: MiniManifest;
  
  // Granted permissions (subset of requested)
  grantedPermissions: MiniPermission[];
  
  // Current route within the mini
  currentRoute: string;
  
  // Is the mini currently active/visible
  isActive: boolean;
  
  // Timestamp when mini was opened
  openedAt: Date;
}

// Mini registry entry (stored in database)
export interface MiniRegistryEntry {
  id: string;
  manifest: MiniManifest;
  
  // Review status
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  
  // Stats
  installCount: number;
  rating: number;
  reviewCount: number;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

// Permission request event
export interface PermissionRequest {
  miniId: string;
  permission: MiniPermission;
  granted: boolean;
  timestamp: Date;
}

// Mini navigation event
export interface MiniNavigationEvent {
  type: 'push' | 'pop' | 'replace';
  from: string;
  to: string;
  miniId: string;
}

// API exposed to minis via postMessage
export interface MiniAPI {
  // Request a permission
  requestPermission(permission: MiniPermission): Promise<boolean>;
  
  // Navigate within the mini
  navigate(path: string): void;
  
  // Close the mini
  close(): void;
  
  // Get current theme (light/dark + colors)
  getTheme(): { mode: 'light' | 'dark'; primary: string; background: string };
  
  // Show a toast notification
  showToast(message: string, type?: 'success' | 'error' | 'info'): void;
  
  // Get current user info (if contacts permission granted)
  getCurrentUser(): Promise<{ id: string; username: string; avatar?: string } | null>;
}
