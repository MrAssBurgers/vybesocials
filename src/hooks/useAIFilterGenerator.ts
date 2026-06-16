import { useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { ARFilterDef } from '@/lib/arFilters';
import { toast } from 'sonner';

export function useAIFilterGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFilters, setGeneratedFilters] = useState<ARFilterDef[]>([]);

  const generateFilter = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    try {
      const { data, error } = await db.functions.invoke('generate-ar-filter', {
        body: { prompt },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return null;
      }
      if (data?.filter) {
        const filter = data.filter as ARFilterDef;
        setGeneratedFilters(prev => [filter, ...prev].slice(0, 10)); // keep last 10
        toast.success(`Created "${filter.name}" ✨`);
        return filter;
      }
      return null;
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate filter');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const clearGenerated = useCallback(() => setGeneratedFilters([]), []);

  return { generateFilter, isGenerating, generatedFilters, clearGenerated };
}
