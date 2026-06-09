import { ManuscriptPlan, ManuscriptSection } from "./manuscriptSchema";

function comparable(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[«»"“”'’.,:;!?()[\]{}—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameText(a: string, b: string): boolean {
  const left = comparable(a);
  const right = comparable(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function finalLike(section: ManuscriptSection): boolean {
  const text = comparable(`${section.originalHeading} ${section.displayHeading}`);
  return /\b(end|finis|conclusion|epilogue)\b/.test(text) || text.includes("конец") || text.includes("послесловие");
}

function shortBody(section: ManuscriptSection): boolean {
  return comparable(section.bodyMarkdown).length < 180;
}

export function postProcessPlan(plan: ManuscriptPlan): ManuscriptPlan {
  let previousHadOrnament = false;

  const sections = plan.sections.map((section, index) => {
    const displayDuplicatesTitle =
      sameText(section.displayHeading, plan.title) ||
      sameText(section.originalHeading, plan.title) ||
      Boolean(plan.subtitle && (sameText(section.displayHeading, plan.subtitle) || sameText(section.originalHeading, plan.subtitle)));

    const nextSection = plan.sections[index + 1];
    const shouldSuppressOrnament =
      index <= 1 ||
      previousHadOrnament ||
      finalLike(section) ||
      shortBody(section) ||
      Boolean(nextSection && shortBody(nextSection));

    const ornament = section.ornament && !shouldSuppressOrnament;
    previousHadOrnament = ornament;

    return {
      ...section,
      displayHeading: displayDuplicatesTitle ? "" : section.displayHeading,
      ornament
    };
  });

  return { ...plan, sections };
}
