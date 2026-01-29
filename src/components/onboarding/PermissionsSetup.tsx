import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Bell, Camera, Mic, Users, Check, Shield, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface PermissionItem {
  id: string;
  name: string;
  description: string;
  icon: typeof Bell;
  isRequired: boolean;
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

export function PermissionsSetup({ onAllRequiredGranted }: PermissionsSetupProps) {
  const { t } = useTranslation();
  const [permissionStates, setPermissionStates] = useState<Record<string, 'granted' | 'denied' | 'pending'>>({
    notifications: 'pending',
    camera: 'pending',
    microphone: 'pending',
    contacts: 'pending',
  });
  const [requesting, setRequesting] = useState<string | null>(null);

  // Check initial permission states
  useEffect(() => {
    const checkPermissions = async () => {
      const states: Record<string, 'granted' | 'denied' | 'pending'> = {
        notifications: 'pending',
        camera: 'pending',
        microphone: 'pending',
        contacts: 'pending',
      };

      // Check notifications
      if ('Notification' in window) {
        states.notifications = Notification.permission === 'granted' ? 'granted' : 
                              Notification.permission === 'denied' ? 'denied' : 'pending';
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
            const result = await Notification.requestPermission();
            setPermissionStates(prev => ({
              ...prev,
              notifications: result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'pending'
            }));
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

  const allGranted = Object.values(permissionStates).every(s => s === 'granted');

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
      <div className="space-y-3">
        {PERMISSIONS.map((permission, index) => {
          const state = permissionStates[permission.id];
          const isGranted = state === 'granted';
          const isDenied = state === 'denied';
          const isRequesting = requesting === permission.id;

          return (
            <motion.div
              key={permission.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "p-4 rounded-2xl border transition-all duration-200",
                isGranted 
                  ? "bg-green-500/10 border-green-500/30" 
                  : isDenied
                    ? "bg-destructive/10 border-destructive/30"
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
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{permission.name}</h3>
                    {permission.isRequired && !isGranted && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {permission.description}
                  </p>
                </div>

                {/* Action Button */}
                {!isGranted && (
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
