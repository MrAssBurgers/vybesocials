import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Image, Camera, X, Sparkles } from 'lucide-react';
import { triggerHaptic } from '@/lib/haptics';
import { playSound } from '@/lib/sounds';
import { VYBEHub } from './VYBEHub';
import { Camera as CameraComponent } from '@/components/camera';

interface CreateMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateMenu({ isOpen, onClose }: CreateMenuProps) {
  const navigate = useNavigate();
  const [showHub, setShowHub] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const handleAction = (action: 'post' | 'camera' | 'hub') => {
    triggerHaptic('medium');
    playSound('pop');
    
    switch (action) {
      case 'post':
        onClose();
        navigate('/upload');
        break;
      case 'camera':
        onClose();
        setShowCamera(true);
        break;
      case 'hub':
        onClose();
        setShowHub(true);
        break;
    }
  };

  const menuItems = [
    { 
      id: 'post' as const, 
      icon: Image, 
      label: 'Create Post', 
      description: 'Share a photo or video',
      color: 'from-pink-500 to-rose-500',
      delay: 0.05,
    },
    { 
      id: 'camera' as const, 
      icon: Camera, 
      label: 'Camera', 
      description: 'Capture a moment',
      color: 'from-cyan-500 to-blue-500',
      delay: 0.1,
    },
    { 
      id: 'hub' as const, 
      icon: Sparkles, 
      label: 'VYBE Hub', 
      description: 'Marketplace, Events & More',
      color: 'from-violet-500 to-purple-600',
      delay: 0.15,
    },
  ];

  return (
    <>
      {/* VYBE Hub Modal */}
      <VYBEHub isOpen={showHub} onClose={() => setShowHub(false)} />

      {/* Camera Fullscreen */}
      {showCamera && (
        <CameraComponent onClose={() => setShowCamera(false)} />
      )}

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop - CSS transition for performance */}
            <div
              className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm animate-fade-in"
              onClick={onClose}
              style={{ animationDuration: '150ms' }}
            />

            {/* Menu - Optimized slide-up animation */}
            <div
              className="fixed inset-0 z-[101] flex items-end sm:items-center justify-center pointer-events-none pb-24 sm:pb-0"
            >
              <div 
                className="liquid-glass overflow-hidden rounded-3xl p-4 w-[90vw] max-w-xs pointer-events-auto animate-slide-up-bounce"
                onClick={(e) => e.stopPropagation()}
                style={{ 
                  transform: 'translateZ(0)',
                  animationDuration: '300ms',
                  animationFillMode: 'both'
                }}
              >
                {/* Header */}
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold gradient-text">Create</h2>
                  <p className="text-xs text-muted-foreground">What do you want to share?</p>
                </div>

                {/* Menu Items - CSS animations for performance */}
                <div className="space-y-2">
                  {menuItems.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => handleAction(item.id)}
                      className="w-full p-3 rounded-2xl liquid-glass-button flex items-center gap-3 active:scale-[0.97] transition-transform duration-100 touch-manipulation animate-fade-in-up"
                      style={{ 
                        animationDelay: `${50 + index * 40}ms`,
                        animationDuration: '200ms',
                        animationFillMode: 'both',
                        transform: 'translateZ(0)'
                      }}
                    >
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                        <item.icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="text-left">
                        <span className="font-medium text-sm block">{item.label}</span>
                        <span className="text-xs text-muted-foreground">{item.description}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="w-full mt-4 p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2 text-sm touch-manipulation animate-fade-in"
                  style={{ animationDelay: '150ms', animationDuration: '200ms', animationFillMode: 'both' }}
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

