import { ManuscriptPlan, ManuscriptSection, PlannedIllustration } from "./manuscriptSchema";

const MAX_MVP_ILLUSTRATIONS = 8;
const fallbackTypes = [
  "marginalia_scene",
  "illuminated_miniature",
  "woodcut_engraving",
  "scribal_diagram",
  "chapter_vignette"
] as const satisfies readonly PlannedIllustration["type"][];

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function illustrationTypeForSection(heading: string, text: string, index: number): PlannedIllustration["type"] {
  const haystack = `${heading} ${text}`.toLowerCase();
  if (haystack.includes("map") || haystack.includes("land") || haystack.includes("realm")) return "map";
  if (haystack.includes("crest") || haystack.includes("seal") || haystack.includes("herald")) return "coat_of_arms";
  if (haystack.includes("beast") || haystack.includes("dragon") || haystack.includes("creature")) return "bestiary_creature";
  if (haystack.includes("flower") || haystack.includes("forest") || haystack.includes("garden")) return "botanical_marginalia";
  if (haystack.includes("crown") || haystack.includes("sword") || haystack.includes("relic")) return "relic_study";
  return fallbackTypes[index % fallbackTypes.length];
}

function illustrationForSection(section: ManuscriptSection, index: number): PlannedIllustration {
  const heading = section.displayHeading || section.originalHeading || `Section ${index + 1}`;
  const text = plainText(section.bodyMarkdown).slice(0, 420);
  const type = illustrationTypeForSection(heading, text, index);

  return {
    type,
    placement: "after",
    prompt: `Create a ${type.replaceAll("_", " ")} for a medieval fantasy manuscript section titled "${heading}". Base the image on this passage: ${text}. Make it a single isolated cutout artwork with transparent alpha background. Only the illustrated subject and decorative medieval ink, faded watercolor, foliage, figures, symbols, or worn gold should be visible. Do not include parchment, paper, page, manuscript sheet, backdrop, environment, sky, ground, vignette, beige texture, glow, square frame, or readable text.`,
    caption: heading.length > 130 ? `${heading.slice(0, 127).trimEnd()}...` : heading
  };
}

export function ensureIllustrationCount(plan: ManuscriptPlan, requestedLimit: number): ManuscriptPlan {
  const target = Math.min(Math.max(0, requestedLimit), MAX_MVP_ILLUSTRATIONS, plan.sections.length);
  const currentCount = plan.sections.filter((section) => section.illustration).length;
  if (currentCount >= target) return plan;

  let remaining = target - currentCount;
  return {
    ...plan,
    sections: plan.sections.map((section, index) => {
      if (remaining <= 0 || section.illustration) return section;
      if (plainText(section.bodyMarkdown).length < 80 && index > 0) return section;
      remaining -= 1;
      return {
        ...section,
        illustration: illustrationForSection(section, index)
      };
    })
  };
}
