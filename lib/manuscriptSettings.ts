import { z } from "zod";

export const manuscriptSettingsSchema = z.object({
  imageLimit: z.number().int().min(0).max(8).default(3),
  chapterStart: z.enum(["auto", "newPage", "inline"]).default("auto"),
  paper: z.string().default("/assets/manuscript/papers/paper-02-burnt-edge-parchment-subtle2.jpg"),
  ornament: z.string().default("/assets/manuscript/marginOrnaments/marginOrnaments-09-ivy-vine-with-red-berries.png"),
  divider: z.string().default("/assets/manuscript/dividers/dividers-04-red-and-gold-gothic-divider.png"),
  titleDivider: z.string().default("/assets/manuscript/dividers/dividers-05-simple-gold-ink-flourish.png"),
  dropcap: z.string().default("/assets/manuscript/dropcaps/dropcaps-03-red-gold-illuminated-initial-frame.png")
});

export type ManuscriptSettings = z.infer<typeof manuscriptSettingsSchema>;

export const defaultManuscriptSettings = manuscriptSettingsSchema.parse({});
