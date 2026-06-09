import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { GeneratedImage } from "./generateImages";
import { ManuscriptPlan, ManuscriptSection } from "./manuscriptSchema";
import { defaultManuscriptSettings, ManuscriptSettings } from "./manuscriptSettings";

type MdNode = {
  type: string;
  value?: string;
  ordered?: boolean;
  url?: string;
  children?: MdNode[];
};

type RenderOptions = {
  imageMode?: "public" | "data";
  interactive?: boolean;
  settings?: ManuscriptSettings;
};

type ManuscriptBlock = {
  html: string;
  units: number;
  className?: string;
  keepWithNext?: boolean;
  newPageBefore?: boolean;
  fitSectionUnits?: number;
  kind?: "text" | "heading" | "rule" | "figure" | "cover";
};

const assetRoot = path.join(process.cwd(), "public");
const assetSettingKeys = ["paper", "ornament", "divider", "titleDivider", "dropcap"] as const;
const manuscriptFonts = {
  garamond: {
    body: "\"Forge EB Garamond\", Georgia, Cambria, \"Times New Roman\", serif",
    display: "\"Forge Cormorant\", \"Forge EB Garamond\", Georgia, serif"
  },
  monomakh: {
    body: "\"Forge Monomakh\", \"Forge EB Garamond\", Georgia, serif",
    display: "\"Forge Monomakh\", \"Forge Cormorant\", serif"
  },
  ponomar: {
    body: "\"Forge Ponomar\", \"Forge EB Garamond\", Georgia, serif",
    display: "\"Forge Ponomar\", \"Forge Cormorant\", serif"
  },
  menaion: {
    body: "\"Forge Menaion\", \"Forge EB Garamond\", Georgia, serif",
    display: "\"Forge Menaion\", \"Forge Cormorant\", serif"
  },
  fedorovsk: {
    body: "\"Forge Fedorovsk\", \"Forge EB Garamond\", Georgia, serif",
    display: "\"Forge Fedorovsk\", \"Forge Cormorant\", serif"
  }
} satisfies Record<ManuscriptSettings["fontStyle"], { body: string; display: string }>;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sanitizeRenderSettings(settings: ManuscriptSettings): Promise<ManuscriptSettings> {
  const next: ManuscriptSettings = { ...settings };
  for (const key of assetSettingKeys) {
    const value = next[key];
    const defaultValue = defaultManuscriptSettings[key];
    if (!value.startsWith("/assets/manuscript/")) {
      next[key] = defaultValue;
      continue;
    }
    const exists = await fileExists(path.join(assetRoot, value.replace(/^\//, "")));
    if (!exists) next[key] = defaultValue;
  }
  return next;
}
const pdfAssetCacheRoot = path.join(process.cwd(), ".cache", "pdf-assets");
const PAGE_UNITS = 112;
const FIRST_PAGE_UNITS = 102;
const MIN_NEXT_PAGE_UNITS = 14;
const NEW_SECTION_START_UNITS = 34;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function mimeType(filePath: string): string {
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function publicAssetToDataUrl(publicPath: string): Promise<string> {
  const normalized = publicPath.split("?")[0].replace(/^\//, "");
  const filePath = path.join(assetRoot, normalized);
  if (isOptimizableImage(filePath)) return optimizedImageDataUrl(filePath, imageOptimizationForPath(filePath));
  const bytes = await fs.readFile(filePath);
  return `data:${mimeType(filePath)};base64,${bytes.toString("base64")}`;
}

function isOptimizableImage(filePath: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(filePath);
}

function imageOptimizationForPath(filePath: string): { maxWidth: number; maxHeight: number; quality: number } {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  if (normalized.includes("/papers/")) return { maxWidth: 1240, maxHeight: 1754, quality: 76 };
  if (normalized.includes("/marginornaments/")) return { maxWidth: 180, maxHeight: 1200, quality: 80 };
  if (normalized.includes("/dividers/")) return { maxWidth: 900, maxHeight: 160, quality: 78 };
  if (normalized.includes("/dropcaps/")) return { maxWidth: 220, maxHeight: 220, quality: 82 };
  if (normalized.includes("/generated/")) return { maxWidth: 820, maxHeight: 620, quality: 78 };
  return { maxWidth: 900, maxHeight: 900, quality: 78 };
}

async function optimizedImageDataUrl(
  filePath: string,
  options: { maxWidth: number; maxHeight: number; quality: number }
): Promise<string> {
  const stat = await fs.stat(filePath);
  const cacheKey = crypto
    .createHash("sha256")
    .update(`${filePath}:${stat.size}:${stat.mtimeMs}:${options.maxWidth}:${options.maxHeight}:${options.quality}`)
    .digest("hex")
    .slice(0, 28);
  const cachePath = path.join(pdfAssetCacheRoot, `${cacheKey}.webp`);

  try {
    const cached = await fs.readFile(cachePath);
    return `data:image/webp;base64,${cached.toString("base64")}`;
  } catch {
    // First time this asset is embedded into a PDF.
  }

  const optimized = await sharp(filePath)
    .rotate()
    .resize({
      width: options.maxWidth,
      height: options.maxHeight,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: options.quality, effort: 5 })
    .toBuffer();

  await fs.mkdir(pdfAssetCacheRoot, { recursive: true });
  await fs.writeFile(cachePath, optimized);
  return `data:image/webp;base64,${optimized.toString("base64")}`;
}

async function assetUrl(publicPath: string, options: RenderOptions): Promise<string> {
  if (options.imageMode === "data") return publicAssetToDataUrl(publicPath);
  return publicPath;
}

function dropcapBackground(dropcapPath: string): string {
  const normalized = dropcapPath.toLowerCase();
  if (normalized.includes("blue")) return "#123044";
  if (normalized.includes("dark") || normalized.includes("woodcut")) return "#1f1712";
  return "#5a150d";
}

function inkThemeForPaper(paperPath: string): { ink: string; fadedInk: string; red: string; gold: string } {
  const normalized = paperPath.toLowerCase();
  if (normalized.includes("dark") || normalized.includes("stained-alchemist")) {
    return {
      ink: "#f5dfaf",
      fadedInk: "#e0bd7b",
      red: "#ffd08a",
      gold: "#f0c35e"
    };
  }
  return {
    ink: "#241105",
    fadedInk: "#553217",
    red: "#7a170f",
    gold: "#a46f1e"
  };
}

async function inlineCssAssetUrls(css: string, options: RenderOptions): Promise<string> {
  if (options.imageMode !== "data") return css;
  const matches = [...css.matchAll(/url\(["']?(\/assets\/manuscript\/[^"')]+)["']?\)/g)];
  let inlined = css;
  for (const match of matches) {
    const source = match[1];
    const dataUrl = await publicAssetToDataUrl(source);
    inlined = inlined.replaceAll(source, dataUrl);
  }
  return inlined;
}

function nodeText(node: MdNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(nodeText).join("") ?? "";
}

function renderInline(node: MdNode): string {
  const children = node.children?.map(renderInline).join("") ?? "";
  switch (node.type) {
    case "text":
      return escapeHtml(node.value ?? "");
    case "emphasis":
      return `<em>${children}</em>`;
    case "strong":
      return `<strong>${children}</strong>`;
    case "inlineCode":
      return `<code>${escapeHtml(node.value ?? "")}</code>`;
    case "link":
      return `<a href="${escapeHtml(node.url ?? "#")}">${children}</a>`;
    case "break":
      return "<br />";
    default:
      return children;
  }
}

function splitFirstPlainLetter(nodes: MdNode[]): { letter: string | null; rest: MdNode[] } {
  const rest: MdNode[] = [];
  let letter: string | null = null;

  for (const node of nodes) {
    if (letter) {
      rest.push(node);
      continue;
    }

    if (node.type === "text" && typeof node.value === "string") {
      const match = node.value.match(/^(\s*)([\s\S])([\s\S]*)$/u);
      if (!match) {
        rest.push(node);
        continue;
      }
      const [, leading, first, remainder] = match;
      letter = first;
      if (leading) rest.push({ ...node, value: leading });
      if (remainder) rest.push({ ...node, value: remainder });
      continue;
    }

    const children = node.children ?? [];
    if (children.length) {
      const split = splitFirstPlainLetter(children);
      if (split.letter) {
        letter = split.letter;
        rest.push({ ...node, children: split.rest });
        continue;
      }
    }

    rest.push(node);
  }

  return { letter, rest };
}

function renderDropCapParagraph(node: MdNode): string {
  const split = splitFirstPlainLetter(node.children ?? []);
  if (!split.letter) return renderBlock(node);
  return `<p><span class="manuscript-dropcap-letter">${escapeHtml(split.letter)}</span>${split.rest.map(renderInline).join("")}</p>`;
}

function renderBlock(node: MdNode): string {
  const children = node.children ?? [];
  switch (node.type) {
    case "paragraph":
      return `<p>${children.map(renderInline).join("")}</p>`;
    case "heading":
      return `<p><strong>${children.map(renderInline).join("")}</strong></p>`;
    case "blockquote":
      return `<blockquote>${children.map(renderBlock).join("")}</blockquote>`;
    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      return `<${tag}>${children.map(renderBlock).join("")}</${tag}>`;
    }
    case "listItem":
      return `<li>${children.map(renderBlock).join("")}</li>`;
    case "code":
      return `<pre><code>${escapeHtml(node.value ?? "")}</code></pre>`;
    case "thematicBreak":
      return `<div class="manuscript-rule"><span></span></div>`;
    default:
      return children.map(renderBlock).join("");
  }
}

function estimateTextUnits(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  const lineCount = Math.max(1, Math.ceil(normalized.length / 68));
  return Math.max(5, lineCount * 3.2 + 2);
}

function blockUnits(node: MdNode): number {
  switch (node.type) {
    case "paragraph":
      return estimateTextUnits(nodeText(node));
    case "blockquote":
      return estimateTextUnits(nodeText(node)) + 3;
    case "list":
      return Math.max(8, (node.children?.length ?? 1) * 5);
    case "code":
      return Math.max(8, Math.ceil((node.value ?? "").length / 80) * 4);
    case "thematicBreak":
      return 7;
    default:
      return estimateTextUnits(nodeText(node));
  }
}

function splitLongParagraph(node: MdNode): MdNode[] {
  if (node.type !== "paragraph" || nodeText(node).length < 520) return [node];
  const text = nodeText(node);
  const sentences = text.match(/[^.!?。！？]+[.!?。！？»"]*|\S.+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > 360 && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.map((value) => ({ type: "paragraph", children: [{ type: "text", value }] }));
}

function markdownToBlocks(markdown: string, dropCap: boolean): ManuscriptBlock[] {
  const tree = unified().use(remarkParse).parse(markdown) as MdNode;
  const nodes = tree.children ?? [];
  const expanded = nodes.flatMap(splitLongParagraph);
  let firstParagraph = true;

  return expanded.map((node) => {
    const isParagraph = node.type === "paragraph";
    const className = dropCap && firstParagraph && isParagraph ? "manuscript-body drop-cap" : "manuscript-body";
    if (isParagraph) firstParagraph = false;
    return {
      html: `<div class="${className}">${className.includes("drop-cap") ? renderDropCapParagraph(node) : renderBlock(node)}</div>`,
      units: blockUnits(node),
      className,
      keepWithNext: node.type === "heading",
      kind: node.type === "heading" ? "heading" : "text"
    };
  });
}

function normalizedTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

async function imageSrc(image: GeneratedImage | undefined, options: RenderOptions): Promise<string | null> {
  if (!image || image.failed) return null;
  if (options.imageMode === "data" && image.filePath) {
    return optimizedImageDataUrl(image.filePath, imageOptimizationForPath(image.filePath));
  }
  return image.url;
}

async function renderFigure(
  section: ManuscriptSection,
  images: Record<string, GeneratedImage>,
  options: RenderOptions
): Promise<ManuscriptBlock | null> {
  if (!section.illustration) return null;
  const image = images[section.id];
  if (!image) return null;
  const caption = escapeHtml(section.illustration.caption);
  const src = await imageSrc(image, options);
  const typeClass = `illustration-${section.illustration.type.replaceAll("_", "-")}`;
  const figureAttrs = `class="manuscript-figure ${typeClass}" data-section-id="${escapeHtml(section.id)}" data-illustration-type="${escapeHtml(section.illustration.type)}" data-illustration-prompt="${escapeHtml(section.illustration.prompt)}" data-illustration-caption="${caption}"`;
  const controls = options.interactive
    ? `<div class="figure-controls">
        <button type="button" data-action="regenerate" data-section-id="${escapeHtml(section.id)}">Regenerate</button>
        <button type="button" data-action="caption" data-section-id="${escapeHtml(section.id)}">Caption</button>
        <button type="button" data-action="upload" data-section-id="${escapeHtml(section.id)}">Upload</button>
        <button type="button" data-action="delete" data-section-id="${escapeHtml(section.id)}">Delete</button>
      </div>`
    : "";

  if (!src) {
    return {
      html: `<figure ${figureAttrs}>${controls}<div class="manuscript-placeholder"></div><figcaption>${caption}</figcaption></figure>`,
      units: 18,
      kind: "figure"
    };
  }

  const figureUnits = section.illustration.type === "map" || section.illustration.type === "chapter_vignette" ? 24 : 26;
  return {
    html: `<figure ${figureAttrs}>${controls}<img src="${escapeHtml(src)}" alt="${caption}" /><figcaption>${caption}</figcaption></figure>`,
    units: figureUnits,
    kind: "figure"
  };
}

function paginateBlocks(blocks: ManuscriptBlock[]): ManuscriptBlock[][] {
  const pages: ManuscriptBlock[][] = [];
  let current: ManuscriptBlock[] = [];
  let used = 0;

  function capacity() {
    return pages.length === 0 ? FIRST_PAGE_UNITS : PAGE_UNITS;
  }

  function pushPage() {
    if (current.length) pages.push(current);
    current = [];
    used = 0;
  }

  blocks.forEach((block, index) => {
    const next = blocks[index + 1];
    const required = block.keepWithNext && next ? block.units + Math.min(next.units, MIN_NEXT_PAGE_UNITS) : block.units;
    const sectionFitsCurrentPage =
      typeof block.fitSectionUnits === "number" && used + block.fitSectionUnits <= capacity();
    const forcedPage = block.newPageBefore && current.length > 0 && !sectionFitsCurrentPage;
    const tooCloseToBottom = current.length > 0 && used + required > capacity();
    if (forcedPage) pushPage();
    if (tooCloseToBottom && block.kind === "figure" && capacity() - used >= 16) {
      block.html = block.html.replace("manuscript-figure", "manuscript-figure compact-figure");
      block.units = Math.min(block.units, Math.max(14, capacity() - used));
    } else if (tooCloseToBottom) {
      pushPage();
    }

    current.push(block);
    used += block.units;

    if (used > capacity() - 4 && index < blocks.length - 1) pushPage();
  });

  pushPage();
  return pages;
}

async function manuscriptBlocks(
  plan: ManuscriptPlan,
  images: Record<string, GeneratedImage>,
  options: RenderOptions
): Promise<ManuscriptBlock[]> {
  const settings = await sanitizeRenderSettings(options.settings ?? defaultManuscriptSettings);
  const titleDivider = await assetUrl(settings.titleDivider, options);
  const blocks: ManuscriptBlock[] = [
    {
      html: `<header class="manuscript-cover"><h1 class="manuscript-title">${escapeHtml(plan.title)}</h1>${
        plan.subtitle ? `<p class="manuscript-subtitle">${escapeHtml(plan.subtitle)}</p>` : ""
      }<div class="manuscript-title-rule"><img src="${escapeHtml(titleDivider)}" alt="" /></div></header>`,
      units: plan.subtitle ? 28 : 23,
      keepWithNext: true,
      kind: "cover"
    }
  ];

  for (const [index, section] of plan.sections.entries()) {
    const figure = await renderFigure(section, images, options);
    const sectionBlocks: ManuscriptBlock[] = [];

    if (section.ornament && index > 1) {
      blocks.push({
        html: `<div class="manuscript-rule"><span></span></div>`,
        units: 7,
        kind: "rule"
      });
    }

    const duplicateDocumentTitle =
      index === 0 &&
      [section.displayHeading, section.originalHeading].some(
        (heading) => heading && normalizedTitle(heading) === normalizedTitle(plan.title)
      );
    if (section.displayHeading && !duplicateDocumentTitle) {
      const chapterCanStartNewPage = index > 0 && section.level <= 2;
      sectionBlocks.push({
        html: `<h${section.level} class="manuscript-heading level-${section.level}">${escapeHtml(section.displayHeading)}</h${section.level}>`,
        units: section.level === 1 ? 11 : 8,
        keepWithNext: true,
        newPageBefore: settings.chapterStart !== "inline" && chapterCanStartNewPage,
        kind: "heading"
      });
    }

    const bodyBlocks = markdownToBlocks(section.bodyMarkdown, section.dropCap);
    sectionBlocks.push(...bodyBlocks);
    if (figure) sectionBlocks.push(figure);

    const sectionStartUnits = sectionBlocks
      .slice(0, 3)
      .reduce((sum, block) => sum + block.units, 0);
    const sectionStart = sectionBlocks.find((block) => block.newPageBefore);
    if (sectionStart && settings.chapterStart === "auto") {
      sectionStart.fitSectionUnits = Math.min(sectionStartUnits, NEW_SECTION_START_UNITS);
    }
    blocks.push(...sectionBlocks);
  }

  return blocks.filter((block, index, all) => {
    const isRule = block.html.includes("manuscript-rule");
    const prevIsRule = index > 0 && all[index - 1].html.includes("manuscript-rule");
    const prevIsCover = index > 0 && all[index - 1].html.includes("manuscript-cover");
    const prevIsHeadingOnly = index > 0 && all[index - 1].html.includes("manuscript-heading");
    const nextIsEnd = all[index + 1]?.html.toLocaleLowerCase().includes("конец тома") || all[index + 1]?.html.toLocaleLowerCase().includes("the end");
    return !(isRule && (prevIsRule || prevIsCover || prevIsHeadingOnly || nextIsEnd || index === all.length - 1));
  });
}

export async function renderManuscriptHtml(
  plan: ManuscriptPlan,
  images: Record<string, GeneratedImage>,
  options: RenderOptions = {}
): Promise<string> {
  const rawCss = await fs.readFile(path.join(process.cwd(), "styles", "manuscript.css"), "utf8");
  const settings = options.settings ?? defaultManuscriptSettings;
  const inkTheme = inkThemeForPaper(settings.paper);
  const fonts = manuscriptFonts[settings.fontStyle];
  const cssVars = `:root{--paper-url:url("${settings.paper}");--ornament-url:url("${settings.ornament}");--divider-url:url("${settings.divider}");--dropcap-url:url("${settings.dropcap}");--dropcap-bg:${dropcapBackground(settings.dropcap)};--manuscript-ink:${inkTheme.ink};--manuscript-faded-ink:${inkTheme.fadedInk};--manuscript-red:${inkTheme.red};--manuscript-gold:${inkTheme.gold};--manuscript-body-font:${fonts.body};--manuscript-display-font:${fonts.display};}`;
  const css = await inlineCssAssetUrls(`${cssVars}\n${rawCss}`, options);
  const pages = paginateBlocks(await manuscriptBlocks(plan, images, options));

  const pageHtml = pages
    .map(
      (page, index) => `<section class="manuscript-sheet" data-page="${index + 1}">
        <div class="manuscript-margin-ornament" aria-hidden="true"></div>
        <div class="manuscript-content">${page.map((block) => block.html).join("\n")}</div>
      </section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(plan.title)}</title>
  <style>${css}</style>
</head>
<body class="manuscript-root">
  <article class="manuscript-book">
    ${pageHtml}
  </article>
  ${
    options.interactive
      ? `<script>
        document.addEventListener("click", (event) => {
          const button = event.target.closest("[data-action][data-section-id]");
          if (!button) return;
          const figure = button.closest("figure[data-section-id]");
          parent.postMessage({
            source: "manuscript-preview",
            action: button.dataset.action,
            sectionId: button.dataset.sectionId,
            illustrationType: figure?.dataset.illustrationType || "",
            prompt: figure?.dataset.illustrationPrompt || "",
            caption: figure?.dataset.illustrationCaption || ""
          }, "*");
        });
      </script>`
      : ""
  }
</body>
</html>`;
}
