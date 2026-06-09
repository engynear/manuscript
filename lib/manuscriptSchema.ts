import { z } from "zod";

export const illustrationTypes = [
  "map",
  "coat_of_arms",
  "woodcut_engraving",
  "illuminated_miniature",
  "chapter_vignette",
  "marginalia_scene",
  "botanical_marginalia",
  "bestiary_creature",
  "relic_study",
  "scribal_diagram"
] as const;

export const manuscriptPlanSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(180).optional().default(""),
  style: z.string().min(1).max(300),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        level: z.number().int().min(1).max(4),
        originalHeading: z.string().max(160),
        displayHeading: z.string().min(1).max(160),
        bodyMarkdown: z.string(),
        dropCap: z.boolean(),
        ornament: z.boolean(),
        illustration: z
          .object({
            type: z.enum(illustrationTypes),
            placement: z.enum(["before", "after"]),
            prompt: z.string().min(20).max(1200),
            caption: z.string().min(1).max(180)
          })
          .nullable()
      })
    )
    .min(1)
    .max(24)
});

export type ManuscriptPlan = z.infer<typeof manuscriptPlanSchema>;
export type ManuscriptSection = ManuscriptPlan["sections"][number];
export type PlannedIllustration = NonNullable<ManuscriptSection["illustration"]>;

export const manuscriptPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "style", "sections"],
  properties: {
    title: { type: "string", minLength: 1, maxLength: 120 },
    subtitle: { type: "string", maxLength: 180 },
    style: { type: "string", minLength: 1, maxLength: 300 },
    sections: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "level",
          "originalHeading",
          "displayHeading",
          "bodyMarkdown",
          "dropCap",
          "ornament",
          "illustration"
        ],
        properties: {
          id: { type: "string", minLength: 1, maxLength: 80 },
          level: { type: "integer", minimum: 1, maximum: 4 },
          originalHeading: { type: "string", maxLength: 160 },
          displayHeading: { type: "string", minLength: 1, maxLength: 160 },
          bodyMarkdown: { type: "string" },
          dropCap: { type: "boolean" },
          ornament: { type: "boolean" },
          illustration: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["type", "placement", "prompt", "caption"],
                properties: {
                  type: { enum: illustrationTypes },
                  placement: { enum: ["before", "after"] },
                  prompt: { type: "string", minLength: 20, maxLength: 1200 },
                  caption: { type: "string", minLength: 1, maxLength: 180 }
                }
              }
            ]
          }
        }
      }
    }
  }
} as const;
