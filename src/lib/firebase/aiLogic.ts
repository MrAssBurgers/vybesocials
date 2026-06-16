import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  type AI,
  type GenerativeModel,
  type Schema,
} from 'firebase/ai';
import { getFirebaseApp } from './app';
import { isFirebaseConfigured } from './config';

let aiInstance: AI | null = null;

/** Default chat model — override later via Remote Config if needed. */
export const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';

export function isAiLogicConfigured(): boolean {
  return isFirebaseConfigured();
}

export function getFirebaseAI(): AI {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  if (!aiInstance) {
    aiInstance = getAI(getFirebaseApp(), {
      backend: new GoogleAIBackend(),
      useLimitedUseAppCheckTokens: true,
    });
  }
  return aiInstance;
}

export function getChatModel(modelId = DEFAULT_CHAT_MODEL): GenerativeModel {
  return getGenerativeModel(getFirebaseAI(), {
    model: modelId,
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 4096,
      topP: 0.95,
      topK: 40,
    },
  });
}

/** Structured JSON output (captions, briefs, agent plans). */
export function getJsonModel(schema: Schema | object, modelId = DEFAULT_CHAT_MODEL): GenerativeModel {
  return getGenerativeModel(getFirebaseAI(), {
    model: modelId,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: schema as any,
    },
  });
}
