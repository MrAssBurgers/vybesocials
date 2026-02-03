import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bell, Camera, Mic, Users, Check, Shield, ChevronRight, Smartphone, MapPin, Vibrate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface PermissionItem {
  id: string;
  name: string;
  description: string;
  icon: typeof Bell;
  isRequired: boolean;
  mobileOnly?: boolean;
}

const PERMISSIONS: PermissionItem[] = [
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Get alerts for messages, calls & updates',
    icon: Bell,
    isRequired: true,
  },
  {
    id: 'camera',
    name: 'Camera',
    description: 'Take photos & record videos',
    icon: Camera,
    isRequired: false,
  },
  {
    id: 'microphone',
    name: 'Microphone',
    description: 'Voice messages & video calls',
    icon: Mic,
    isRequired: false,
  },
  {
    id: 'motion',
    name: 'Motion & Sensors',
    description: 'Shake detection & gesture controls',
    icon: Smartphone,
    isRequired: false,
    mobileOnly: true,
  },
  {
    id: 'location',
    name: 'Location',
    description: 'Find nearby friends & local events',
    icon: MapPin,
    isRequired: false,
  },
  {
    id: 'haptics',
    name: 'Haptics & Vibration',
    description: 'Tactile feedback for interactions',
    icon: Vibrate,
    isRequired: false,
    mobileOnly: true,
  },
  {
    id: 'contacts',
    name: 'Contacts',
    description: 'Find friends already on VYBE',
    icon: Users,
    isRequired: false,
  },
];

interface PermissionsSetupProps {
  onAllRequiredGranted: (granted: boolean) => void;
}

type PermissionState = 'granted' | 'denied' | 'pending' | 'unsupported';

export function PermissionsSetup({ onAllRequiredGranted }: PermissionsSetupProps) {
  const { t } = useTranslation();
  const [permissionStates, setPermissionStates] = useState<Record<string, PermissionState>>({
    notifications: 'pending',
    camera: 'pending',
    microphone: 'pending',
    motion: 'pending',
    location: 'pending',
    haptics: 'pending',
    contacts: 'pending',
  });
  const [requesting, setRequesting] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect if mobile/tablet
  useEffect(() => {
    const checkMobile = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 1024;
      setIsMobile(isTouchDevice && isSmallScreen);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check initial permission states
  useEffect(() => {
    const checkPermissions = async () => {
      const states: Record<string, PermissionState> = {
        notifications: 'pending',
        camera: 'pending',
        microphone: 'pending',
        motion: 'pending',
        location: 'pending',
        haptics: 'pending',
        contacts: 'pending',
      };

      // Check notifications - handle all possible states
      if ('Notification' in window) {
        const permission = Notification.permission;
        if (permission === 'granted') {
          states.notifications = 'granted';
        } else if (permission === 'denied') {
          states.notifications = 'denied';
        } else {
          states.notifications = 'pending';
        }
      } else {
        states.notifications = 'unsupported';
      }

      // Check camera/microphone via permissions API
      if ('permissions' in navigator) {
        try {
          const camera = await navigator.permissions.query({ name: 'camera' as PermissionName });
          states.camera = camera.state === 'granted' ? 'granted' : 
                         camera.state === 'denied' ? 'denied' : 'pending';
        } catch {
          // Permissions API might not support camera
        }

        try {
          const mic = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          states.microphone = mic.state === 'granted' ? 'granted' : 
                             mic.state === 'denied' ? 'denied' : 'pending';
        } catch {
          // Permissions API might not support microphone
        }
      }

      // Check geolocation separately - more reliable across browsers
      if ('geolocation' in navigator) {
        try {
          if ('permissions' in navigator) {
            const geo = await navigator.permissions.query({ name: 'geolocation' });
            states.location = geo.state === 'granted' ? 'granted' : 
                             geo.state === 'denied' ? 'denied' : 'pending';
          }
        } catch {
          // Geolocation permissions query not supported, leave as pending
          states.location = 'pending';
        }
      } else {
        states.location = 'unsupported';
      }

      // Check motion sensors - DeviceMotionEvent requires permission on iOS 13+
      if (typeof DeviceMotionEvent !== 'undefined') {
        // @ts-ignore - requestPermission is iOS-specific
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
          // iOS 13+ - requires explicit permission
          states.motion = 'pending';
        } else {
          // Android and other platforms - generally granted by default
          states.motion = 'granted';
        }
      } else {
        states.motion = 'unsupported';
      }

      // Check haptics/vibration support
      if ('vibrate' in navigator) {
        states.haptics = 'granted'; // Vibration API doesn't require explicit permission
      } else {
        states.haptics = 'unsupported';
      }

      // Contacts API doesn't have a persistent permission check
      // It's per-request, so we leave it as pending

      setPermissionStates(states);
    };

    checkPermissions();
  }, []);

  // Check if all required permissions are granted
  useEffect(() => {
    const requiredPermissions = PERMISSIONS.filter(p => p.isRequired);
    const allRequiredGranted = requiredPermissions.every(
      p => permissionStates[p.id] === 'granted'
    );
    onAllRequiredGranted(allRequiredGranted);
  }, [permissionStates, onAllRequiredGranted]);

  const requestPermission = useCallback(async (permissionId: string) => {
    setRequesting(permissionId);

    try {
      switch (permissionId) {
        case 'notifications':
          if ('Notification' in window) {
            try {
              // Request permission and wait for result
              const result = await Notification.requestPermission();
              console.log('[Permissions] Notification permission result:', result);
              
              if (result === 'granted') {
                setPermissionStates(prev => ({ ...prev, notifications: 'granted' }));
              } else if (result === 'denied') {
                setPermissionStates(prev => ({ ...prev, notifications: 'denied' }));
              } else {
                // 'default' means the user dismissed the prompt without choosing
                setPermissionStates(prev => ({ ...prev, notifications: 'pending' }));
              }
            } catch (error) {
              console.error('[Permissions] Notification request error:', error);
              // Some browsers require user gesture - check current state
              const currentState = Notification.permission;
              setPermissionStates(prev => ({
                ...prev,
                notifications: currentState === 'granted' ? 'granted' : 
                              currentState === 'denied' ? 'denied' : 'pending'
              }));
            }
          } else {
            setPermissionStates(prev => ({ ...prev, notifications: 'unsupported' }));
          }
          break;

        case 'camera':
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
            setPermissionStates(prev => ({ ...prev, camera: 'granted' }));
          } catch {
            setPermissionStates(prev => ({ ...prev, camera: 'denied' }));
          }
          break;

        case 'microphone':
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            setPermissionStates(prev => ({ ...prev, microphone: 'granted' }));
          } catch {
            setPermissionStates(prev => ({ ...prev, microphone: 'denied' }));
          }
          break;

        case 'motion':
          try {
            // @ts-ignore - requestPermission is iOS-specific
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
              // @ts-ignore
              const result = await DeviceMotionEvent.requestPermission();
              setPermissionStates(prev => ({
                ...prev,
                motion: result === 'granted' ? 'granted' : 'denied'
              }));
            } else {
              // Android/other - test by listening for event
              const testMotion = () => {
                setPermissionStates(prev => ({ ...prev, motion: 'granted' }));
                window.removeEventListener('devicemotion', testMotion);
              };
              window.addEventListener('devicemotion', testMotion, { once: true });
              
              // If no event after 1 second, assume granted (some devices don't emit events when stationary)
              setTimeout(() => {
                window.removeEventListener('devicemotion', testMotion);
                setPermissionStates(prev => ({ 
                  ...prev, 
                  motion: prev.motion === 'pending' ? 'granted' : prev.motion 
                }));
              }, 1000);
            }
          } catch {
            setPermissionStates(prev => ({ ...prev, motion: 'denied' }));
          }
          break;

        case 'location':
          if ('geolocation' in navigator) {
            try {
              await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    console.log('[Permissions] Location granted');
                    resolve(position);
                  },
                  (error) => {
                    console.error('[Permissions] Location error:', error.code, error.message);
                    reject(error);
                  },
                  {
                    timeout: 15000,
                    maximumAge: 0,
                    enableHighAccuracy: false // Less strict, more likely to succeed
                  }
                );
              });
              setPermissionStates(prev => ({ ...prev, location: 'granted' }));
            } catch (error: any) {
              // GeolocationPositionError codes:
              // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
              if (error?.code === 1) {
                setPermissionStates(prev => ({ ...prev, location: 'denied' }));
              } else {
                // Position unavailable or timeout - permission might still be granted
                // Check via permissions API if available
                try {
                  if ('permissions' in navigator) {
                    const geo = await navigator.permissions.query({ name: 'geolocation' });
                    setPermissionStates(prev => ({
                      ...prev,
                      location: geo.state === 'granted' ? 'granted' : 
                               geo.state === 'denied' ? 'denied' : 'pending'
                    }));
                  } else {
                    // Can't determine, mark as denied for safety
                    setPermissionStates(prev => ({ ...prev, location: 'denied' }));
                  }
                } catch {
                  setPermissionStates(prev => ({ ...prev, location: 'denied' }));
                }
              }
            }
          } else {
            setPermissionStates(prev => ({ ...prev, location: 'unsupported' }));
          }
          break;

        case 'haptics':
          // Vibration API doesn't require permission - just test it
          if ('vibrate' in navigator) {
            navigator.vibrate(50); // Short vibration to confirm it works
            setPermissionStates(prev => ({ ...prev, haptics: 'granted' }));
          } else {
            setPermissionStates(prev => ({ ...prev, haptics: 'unsupported' }));
          }
          break;

        case 'contacts':
          // Contacts API is per-request, just mark as granted if supported
          if ('contacts' in navigator && 'ContactsManager' in window) {
            setPermissionStates(prev => ({ ...prev, contacts: 'granted' }));
          } else {
            // Fallback for browsers without Contacts API - mark as granted to not block
            setPermissionStates(prev => ({ ...prev, contacts: 'granted' }));
          }
          break;
      }
    } catch (error) {
      console.error(`Error requesting ${permissionId} permission:`, error);
    } finally {
      setRequesting(null);
    }
  }, []);

  // Filter permissions based on device type
  const visiblePermissions = PERMISSIONS.filter(p => {
    if (p.mobileOnly && !isMobile) return false;
    if (permissionStates[p.id] === 'unsupported') return false;
    return true;
  });

  const allGranted = visiblePermissions.every(p => 
    permissionStates[p.id] === 'granted' || permissionStates[p.id] === 'unsupported'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
          <Shield className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold mb-2">App Permissions</h1>
        <p className="text-muted-foreground">
          VYBE needs a few permissions to give you the best experience
        </p>
      </div>

      {/* Permission Cards */}
      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
        {visiblePermissions.map((permission, index) => {
          const state = permissionStates[permission.id];
          const isGranted = state === 'granted';
          const isDenied = state === 'denied';
          const isUnsupported = state === 'unsupported';
          const isRequesting = requesting === permission.id;

          return (
            <motion.div
              key={permission.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className={cn(
                "p-4 rounded-2xl border transition-all duration-200",
                isGranted 
                  ? "bg-green-500/10 border-green-500/30" 
                  : isDenied
                    ? "bg-destructive/10 border-destructive/30"
                    : isUnsupported
                      ? "bg-muted/50 border-border/50 opacity-50"
                      : "bg-card border-border"
              )}
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                  isGranted
                    ? "bg-green-500/20"
                    : "bg-muted"
                )}>
                  {isGranted ? (
                    <Check className="h-6 w-6 text-green-500" />
                  ) : (
                    <permission.icon className={cn(
                      "h-6 w-6",
                      isDenied ? "text-destructive" : "text-foreground"
                    )} />
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{permission.name}</h3>
                    {permission.isRequired && !isGranted && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                        Required
                      </span>
                    )}
                    {permission.mobileOnly && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/20 text-accent-foreground">
                        Mobile
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {permission.description}
                  </p>
                </div>

                {/* Action Button */}
                {!isGranted && !isUnsupported && (
                  <Button
                    size="sm"
                    variant={isDenied ? "outline" : "default"}
                    onClick={() => requestPermission(permission.id)}
                    disabled={isRequesting}
                    className="shrink-0"
                  >
                    {isRequesting ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : isDenied ? (
                      'Retry'
                    ) : (
                      <>
                        Allow
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                )}

                {isGranted && (
                  <div className="shrink-0 text-green-500 font-medium text-sm">
                    Enabled
                  </div>
                )}

                {isUnsupported && (
                  <div className="shrink-0 text-muted-foreground font-medium text-sm">
                    N/A
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Status Message */}
      {allGranted ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center p-4 rounded-xl bg-green-500/10 border border-green-500/30"
        >
          <p className="text-green-500 font-medium">
            ✓ All permissions granted! You're all set.
          </p>
        </motion.div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Tap "Allow" on each permission to continue. Required permissions must be enabled.
        </p>
      )}
    </div>
  );
}
