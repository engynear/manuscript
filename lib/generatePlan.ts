import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getOpenAI, PLAN_MODEL } from "./openai";
import { NormalizedMarkdown } from "./markdown";
import { manuscriptPlanJsonSchema, manuscriptPlanSchema, ManuscriptPlan } from "./manuscriptSchema";

const CACHE_DIR = path.join(process.cwd(), ".cache", "plans");

export function contentHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

async function readCachedPlan(hash: string): Promise<ManuscriptPlan | null> {
  try {
    const raw = await fs.readFile(path.join(CACHE_DIR, `${hash}.json`), "utf8");
    return manuscriptPlanSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeCachedPlan(hash: string, plan: ManuscriptPlan): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${hash}.json`), JSON.stringify(plan, null, 2));
}

export async function generatePlan(normalized: NormalizedMarkdown, hash: string): Promise<ManuscriptPlan> {
  const cached = await readCachedPlan(hash);
  if (cached) return restoreSourceBodyMarkdown(cached, normalized);

  const sectionBrief = normalized.sections.map((section) => ({
    id: section.id,
    level: section.level,
    originalHeading: section.originalHeading,
    excerpt: section.bodyMarkdown.slice(0, 1800),
    bodyLength: section.bodyMarkdown.length
  }));

  const response = await getOpenAI().responses.create({
    model: PLAN_MODEL,
    input: [
      {
        role: "system",
        content:
          "You are an expert book designer and fantasy editor. Return only valid structured JSON that follows the schema. Preserve the meaning and section order of the source while making headings literary and manuscript-like."
      },
      {
        role: "user",
        content: `Create a medieval fantasy manuscript plan for this Markdown. Requirements:
- Keep every section id exactly as provided.
- Do not summarize, truncate, rewrite, or continue bodyMarkdown. Copy bodyMarkdown from the provided section excerpt only as a placeholder; the server will restore the original full Markdown after validation.
- Never invent missing prose and never remove sentences.
- Use at most 8 illustrations total.
- Choose illustration types from: map, coat_of_arms, woodcut_engraving, illuminated_miniature, chapter_vignette, marginalia_scene, botanical_marginalia, bestiary_creature, relic_study, scribal_diagram.
- Image prompts must describe isolated cutout artwork with transparent alpha. Explicitly avoid parchment, paper, page, manuscript sheet, backdrop, environment, sky, ground, vignette, beige texture, glow, hard frames, and readable text.
- For the MVP, prefer illustration placement "after"; illustrations should sit inside their own section after opening prose, not between two chapter headings.
- Use drop caps on important opening sections.
- Use ornaments where a divider would improve pacing.

Sections:
${JSON.stringify(sectionBrief, null, 2)}`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "manuscript_plan",
        schema: manuscriptPlanJsonSchema,
        strict: true
      }
    }
  } as never);

  const parsed = manuscriptPlanSchema.parse(JSON.parse(response.output_text));
  const capped = restoreSourceBodyMarkdown(capIllustrations(parsed), normalized);
  await writeCachedPlan(hash, capped);
  return capped;
}

function restoreSourceBodyMarkdown(plan: ManuscriptPlan, normalized: NormalizedMarkdown): ManuscriptPlan {
  const planById = new Map(plan.sections.map((section) => [section.id, section]));

  return {
    ...plan,
    sections: normalized.sections.map((source, index) => {
      const planned = planById.get(source.id);
      return {
        id: source.id,
        level: source.level,
        originalHeading: source.originalHeading,
        displayHeading: planned?.displayHeading?.trim() || source.originalHeading,
        bodyMarkdown: source.bodyMarkdown,
        dropCap: planned?.dropCap ?? index === 0,
        ornament: planned?.ornament ?? false,
        illustration: planned?.illustration ?? null
      };
    })
  };
}

function capIllustrations(plan: ManuscriptPlan): ManuscriptPlan {
  // MVP image limit: change this number when you are ready to pay for and render more artwork.
  let remaining = 8;
  return {
    ...plan,
    sections: plan.sections.map((section) => {
      if (!section.illustration) return section;
      if (remaining > 0) {
        remaining -= 1;
        return section;
      }
      return { ...section, illustration: null };
    })
  };
}
