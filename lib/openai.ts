import OpenAI from "openai";
import { fetch as undiciFetch, Agent } from "undici";

let cachedClient: OpenAI | null = null;

// Next.js patches the global `fetch`, and that patched client drops the OpenAI
// SDK's long-lived non-streaming connections ("other side closed") on slow
// plan/image calls. Use a dedicated undici fetch with generous timeouts so the
// SDK talks straight to the network and is unaffected by Next's instrumentation.
const dispatcher = new Agent({
  headersTimeout: 600_000,
  bodyTimeout: 600_000,
  connect: { timeout: 30_000 }
});

const directFetch = ((input, init) =>
  undiciFetch(input as never, { ...(init as never), dispatcher })) as unknown as typeof fetch;

export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Configure it in .env.local locally or .env for Docker.");
  }

  cachedClient ??= new OpenAI({ apiKey, fetch: directFetch, maxRetries: 0, timeout: 300_000 });
  return cachedClient;
}

// Change planning and image models here as newer OpenAI models become preferable.
export const PLAN_MODEL = process.env.OPENAI_PLAN_MODEL ?? "gpt-4.1";
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
export const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY ?? "medium";
