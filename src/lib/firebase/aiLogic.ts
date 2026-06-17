import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  type AI,
  type GenerativeModel,
  type Schema,
} from 'firebase/ai';
import { getFirebaseApp } from './app';
import { isAppCheckInitialized, isAppCheckTokenVerified } from './appCheck';
import { isFirebaseConfigured } from './config';

let aiInstance: AI | null = null;

/** Default chat model — cheapest tier for cost control. */
export const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash-lite';

export function isAiLogicConfigured(): boolean {
  return isFirebaseConfigured();
}

export function getFirebaseAI(): AI {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }
  if (!aiInstance) {
    const options: NonNullable<Parameters<typeof getAI>[1]> = {
      backend: new GoogleAIBackend(),
    };
    // Limited-use tokens require a valid App Check token — skip when verification failed.
    if (isAppCheckInitialized() && isAppCheckTokenVerified()) {
      options.useLimitedUseAppCheckTokens = true;
    }
    aiInstance = getAI(getFirebaseApp(), options);
  }
  return aiInstance;
}

const CHAT_GENERATION_CONFIG = {
  temperature: 0.85,
  maxOutputTokens: 1024,
  topP: 0.95,
  topK: 40,
} as const;

export function getChatModel(modelId = DEFAULT_CHAT_MODEL): GenerativeModel {
  return getGenerativeModel(getFirebaseAI(), {
    model: modelId,
    generationConfig: { ...CHAT_GENERATION_CONFIG },
  });
}

export function getChatModelWithSystem(
  systemInstruction: string,
  modelId = DEFAULT_CHAT_MODEL,
): GenerativeModel {
  return getGenerativeModel(getFirebaseAI(), {
    model: modelId,
    systemInstruction,
    generationConfig: { ...CHAT_GENERATION_CONFIG },
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
