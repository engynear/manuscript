import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.warn("OPENAI_API_KEY is not set. Generation requests will fail until .env.local is configured.");
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Change planning and image models here as newer OpenAI models become preferable.
export const PLAN_MODEL = process.env.OPENAI_PLAN_MODEL ?? "gpt-4.1";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
export const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY ?? "medium";
