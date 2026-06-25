import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { Home, ArrowLeft } from "lucide-react";
import { VybeMiniIcon } from "@/components/ui/VybeMiniIcon";
import { VybeWordmark } from "@/components/ui/VybeWordmark";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Repair malformed brief deep links like `/brief&topic=Climate`
    // (missing `?` separator) by redirecting to the proper `/brief?…`.
    if (location.pathname.startsWith('/brief') && location.pathname !== '/brief') {
      const rest = location.pathname.slice('/brief'.length);
      // Strip leading non-alnum chars (`&`, `/`, etc.) and turn the first one into `?`
      const cleaned = rest.replace(/^[^a-zA-Z0-9]+/, '');
      navigate(`/brief${cleaned ? `?${cleaned}` : ''}`, { replace: true });
      return;
    }
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname, navigate]);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-background">
      {/* Gradient mesh background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-[400px] h-[400px] rounded-full bg-accent/10 blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-primary/5 blur-[80px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 text-center px-6 max-w-md">
        {/* Glitch 404 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 15, stiffness: 100 }}
          className="relative mb-6"
        >
          <h1 className="text-[120px] sm:text-[160px] font-black leading-none tracking-tighter text-foreground/5 select-none">
            404
          </h1>
          {/* Glitch layers */}
          <motion.h1
            className="absolute inset-0 text-[120px] sm:text-[160px] font-black leading-none tracking-tighter text-primary/30 select-none"
            animate={{
              x: [0, -3, 3, 0, 2, -2, 0],
              opacity: [0.3, 0.5, 0.3, 0.4, 0.3],
            }}
            transition={{ duration: 3, repeat: Infinity, repeatType: 'mirror' }}
          >
            404
          </motion.h1>
          <motion.h1
            className="absolute inset-0 text-[120px] sm:text-[160px] font-black leading-none tracking-tighter text-accent/20 select-none"
            animate={{
              x: [0, 2, -2, 0, -3, 3, 0],
              opacity: [0.2, 0.4, 0.2, 0.3, 0.2],
            }}
            transition={{ duration: 2.5, repeat: Infinity, repeatType: 'mirror', delay: 0.3 }}
          >
            404
          </motion.h1>
          {/* Center glow text */}
          <h1 className="absolute inset-0 text-[120px] sm:text-[160px] font-black leading-none tracking-tighter gradient-text select-none drop-shadow-[0_0_40px_hsl(var(--primary)/0.3)]">
            404
          </h1>
        </motion.div>

        {/* Logo with ambient glow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-2 mb-4"
        >
          <div className="relative">
            <div className="absolute inset-0 blur-xl bg-primary/30 rounded-full scale-150" />
            <VybeMiniIcon size={32} showSparkles />
          </div>
          <VybeWordmark size="lg" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-lg font-medium text-foreground/70 mb-2"
        >
          This page doesn't exist
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-sm text-muted-foreground mb-8"
        >
          The page at <code className="px-1.5 py-0.5 rounded-md bg-muted/50 text-xs font-mono text-foreground/60">{location.pathname}</code> was not found.
        </motion.p>

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col sm:flex-row gap-3 items-center justify-center"
        >
          <Button
            onClick={() => navigate('/')}
            className="rounded-full px-8 h-12 text-sm font-semibold gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-shadow"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="rounded-full px-6 h-10 text-sm gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Button>
        </motion.div>

        {/* Floating particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-primary/40"
            style={{
              left: `${15 + Math.random() * 70}%`,
              top: `${10 + Math.random() * 80}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 0.6, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default NotFound;
