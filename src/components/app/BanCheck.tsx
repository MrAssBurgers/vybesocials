import { useBanStatus } from "@/hooks/useBanStatus";
import { BannedScreen } from "@/components/auth/BannedScreen";
import { MemeBanScreen } from "@/components/auth/MemeBanScreen";

export default function BanCheck() {
  const { data: banData } = useBanStatus();
  
  if (!banData) return null;
  
  if (banData.is_meme_ban) {
    return <MemeBanScreen reason={banData.reason} expiresAt={banData.expires_at} customGifUrl={banData.custom_gif_url} />;
  }
  
  return (
    <BannedScreen 
      reason={banData.reason} 
      expiresAt={banData.expires_at} 
      isPermanent={banData.is_permanent} 
    />
  );
}
