import { useRef, useEffect, useState, memo } from 'react';
import { motion } from 'framer-motion';

interface WaveformVisualizerProps {
  waveformData: number[] | any; // Can be array of numbers or complex waveform data
  isPlaying?: boolean;
  progress?: number; // 0-100
  duration?: number;
  height?: number;
  onSeek?: (percentage: number) => void;
  className?: string;
}

export const WaveformVisualizer = memo(function WaveformVisualizer({
  waveformData,
  isPlaying = false,
  progress = 0,
  duration = 0,
  height = 48,
  onSeek,
  className = ''
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 300, height });

  // Parse waveform data - handle different formats
  const normalizeWaveformData = (data: any): number[] => {
    if (Array.isArray(data)) {
      return data.length > 0 ? data : generateFallbackWaveform();
    }
    
    if (data && typeof data === 'object') {
      // Handle complex waveform objects
      if (data.peaks) return data.peaks;
      if (data.data) return data.data;
      if (data.samples) return data.samples;
    }
    
    return generateFallbackWaveform();
  };

  // Generate fallback waveform if no data available
  const generateFallbackWaveform = (): number[] => {
    const bars = 60;
    return Array.from({ length: bars }, (_, i) => {
      // Create a more musical waveform pattern
      const base = Math.sin(i * 0.1) * 0.3;
      const detail = Math.sin(i * 0.3) * 0.2;
      const noise = (Math.random() - 0.5) * 0.1;
      return Math.max(0.1, Math.min(1, 0.4 + base + detail + noise));
    });
  };

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      setCanvasSize({ width: Math.floor(width), height });
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [height]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    
    const waveform = normalizeWaveformData(waveformData);
    const barCount = Math.min(waveform.length, Math.floor(canvasSize.width / 3));
    const barWidth = Math.max(2, Math.floor(canvasSize.width / barCount) - 1);
    const maxHeight = canvasSize.height - 8;
    
    waveform.slice(0, barCount).forEach((amplitude, index) => {
      const x = index * (barWidth + 1);
      const barHeight = Math.max(2, amplitude * maxHeight);
      const y = (canvasSize.height - barHeight) / 2;
      
      // Progress-based coloring
      const progressPosition = (progress / 100) * canvasSize.width;
      const isPlayed = x < progressPosition;
      
      // Set color
      if (isPlayed) {
        // Played portion - gradient from primary to accent
        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--primary').trim() 
          ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--primary')})`
          : '#3b82f6';
      } else {
        // Unplayed portion - muted
        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--muted-foreground').trim()
          ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground')} / 0.3)`
          : 'rgba(156, 163, 175, 0.3)';
      }
      
      // Draw bar with rounded corners
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      ctx.fill();
      
      // Add playing animation
      if (isPlaying && isPlayed && index % 3 === Math.floor(Date.now() / 100) % 3) {
        ctx.fillStyle = getComputedStyle(document.documentElement)
          .getPropertyValue('--accent').trim()
          ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--accent')})`
          : '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(x, y - 1, barWidth, barHeight + 2, barWidth / 2);
        ctx.fill();
      }
    });
    
  }, [waveformData, canvasSize, progress, isPlaying]);

  const handleClick = (e: React.MouseEvent) => {
    if (!onSeek || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    onSeek(Math.max(0, Math.min(100, percentage)));
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full ${onSeek ? 'cursor-pointer' : ''} ${className}`}
      style={{ height }}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ 
          width: canvasSize.width, 
          height: canvasSize.height 
        }}
      />
      
      {/* Progress line */}
      {progress > 0 && (
        <motion.div
          className="absolute top-0 bottom-0 w-0.5 bg-primary rounded-full"
          style={{ left: `${progress}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}
      
      {/* Hover effect */}
      {onSeek && (
        <div className="absolute inset-0 bg-primary/5 opacity-0 hover:opacity-100 transition-opacity duration-200 rounded" />
      )}
    </div>
  );
});