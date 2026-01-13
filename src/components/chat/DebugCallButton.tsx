import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface ApiResponse {
  roomUrl?: string;
  roomName?: string;
  error?: string;
}

export function DebugCallButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleTest = async () => {
    setIsLoading(true);
    setResult(null);
    
    console.log('[DEBUG] Starting API test...');
    
    try {
      const { data, error } = await supabase.functions.invoke<ApiResponse>(
        'api-calls-create-room',
        {
          body: {
            type: 'audio',
            expiryMinutes: 60,
          },
        }
      );
      
      console.log('[DEBUG] API response:', { data, error });
      
      if (error) {
        setResult(`❌ ERROR: ${error.message || JSON.stringify(error)}`);
      } else if (data?.roomUrl) {
        setResult(`✅ SUCCESS\nroomUrl: ${data.roomUrl}\nroomName: ${data.roomName}`);
      } else {
        setResult(`⚠️ UNEXPECTED: ${JSON.stringify(data)}`);
      }
    } catch (err: any) {
      console.error('[DEBUG] Exception:', err);
      setResult(`❌ EXCEPTION: ${err?.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-3 bg-yellow-500/20 border border-yellow-500 rounded-lg space-y-2">
      <p className="text-xs font-mono text-yellow-600 dark:text-yellow-400">
        DEBUG: Test API Only
      </p>
      <Button 
        onClick={handleTest} 
        disabled={isLoading}
        variant="outline"
        size="sm"
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Testing...
          </>
        ) : (
          'POST /api-calls-create-room'
        )}
      </Button>
      {result && (
        <pre className="text-xs font-mono p-2 bg-background rounded whitespace-pre-wrap break-all">
          {result}
        </pre>
      )}
    </div>
  );
}
