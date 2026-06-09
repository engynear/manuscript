import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Configure it in .env.local locally or .env for Docker.");
  }

  cachedClient ??= new OpenAI({ apiKey });
  return cachedClient;
}

// Change planning and image models here as newer OpenAI models become preferable.
export const PLAN_MODEL = process.env.OPENAI_PLAN_MODEL ?? "gpt-4.1";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
export const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY ?? "medium";
