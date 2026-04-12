

## Rename AI to VYBE-AI & Add Image Upload to AI Chat

### Changes

**1. Rename AI default name from "Morgan" to "VYBE-AI"**
- `src/pages/AIChat.tsx` — change all default name references from `'Morgan'` to `'VYBE-AI'` (lines 67, 74, 151, 521-526)
- `src/hooks/useAIProfile.ts` — change `DEFAULT_AI_PROFILE.name` from `'Morgan'` to `'VYBE-AI'`
- `src/components/ai/AIChatAssistant.tsx` — update the old "Brock" assistant name/personality to `'VYBE-AI'`
- `src/components/dna/DNAChatAssistant.tsx` — if it references "Morgan", update there too

**2. Add image upload button to AI chat input bar (`src/pages/AIChat.tsx`)**
- Add an image picker button (camera/image icon) next to the location and send buttons in the input area
- When tapped, open a file picker accepting `image/*`
- Show a small preview thumbnail above the input bar when an image is selected, with an X to remove it
- On send, convert the image to base64 (resized to max 1024px for efficiency) and include it in the request body as `image_base64` + `mime_type`
- Update the `Message` type to optionally hold `imageUrl?: string` so uploaded images render in chat bubbles
- Render user-sent images as inline `<img>` above the text in the user's chat bubble

**3. Update edge function to accept and forward images (`supabase/functions/ai-chat/index.ts`)**
- Parse `image_base64` and `mime_type` from request body
- When present, construct the last user message as a multimodal content array (text + image_url with data URI) per the Lovable AI Gateway format
- The model (`google/gemini-3-flash-preview`) supports multimodal input natively

### Files to modify
- `src/pages/AIChat.tsx` — image upload UI, rename defaults
- `src/hooks/useAIProfile.ts` — rename default
- `src/components/ai/AIChatAssistant.tsx` — rename default
- `supabase/functions/ai-chat/index.ts` — accept image in request, forward as multimodal message

