import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { getOpenAI, IMAGE_MODEL, IMAGE_QUALITY } from "./openai";
import { ManuscriptPlan } from "./manuscriptSchema";

export type GeneratedImage = {
  sectionId: string;
  url: string | null;
  filePath: string | null;
  caption: string;
  failed: boolean;
};

export type ImageProgressEvent =
  | { type: "image-cache"; sectionId: string; index: number; total: number }
  | { type: "image-start"; sectionId: string; index: number; total: number }
  | { type: "image-complete"; sectionId: string; index: number; total: number }
  | { type: "image-failed"; sectionId: string; index: number; total: number };

const PUBLIC_GENERATED_DIR = path.join(process.cwd(), "public", "generated");
const IMAGE_CACHE_VERSION = process.env.MANUSCRIPT_IMAGE_CACHE_VERSION ?? "v3";

function imageSizeForType(type: string): "1024x1024" | "1536x1024" | "1024x1536" {
  if (type === "map" || type === "chapter_vignette" || type === "scribal_diagram") return "1536x1024";
  if (type === "coat_of_arms") return "1024x1536";
  return "1024x1024";
}

function manuscriptIllustrationStyle(type: string): string {
  const base =
    "Transparent-background medieval manuscript cutout asset. Single isolated illustration only. Object extraction style. PNG alpha cutout. The background must be fully transparent, not beige, not parchment-colored, not off-white. Only visible pixels should be the artwork itself: medieval figures, creatures, heraldry, map ink, decorative foliage, relics, diagram marks, lapis blue, vermilion red, verdigris green, violet shadows, and worn gold ornament when relevant. Invisible forbidden elements: parchment, paper, page, manuscript sheet, backdrop, environment, sky, ground, vignette, beige texture, cream texture, glow, shadow box, border, frame, white margin, rectangular tile. Hand-drawn ink and faded watercolor with real color, not monochrome sepia. Soft broken paint edges dissolving directly into transparent alpha. No readable text, no letters, no modern objects.";

  const variants: Record<string, string> = {
    map: "Isolated fantasy cartography drawing only: coastlines, rivers, mountains, ruins, old roads, compass marks, torn-looking ink clusters, blue rivers and red route marks. No parchment map sheet, no labels, no rectangular map tile, no paper background. The map strokes and watercolor washes dissolve into transparent alpha.",
    coat_of_arms:
      "Isolated heraldic device only: shield, crest, symbolic beasts, plants, ribbons without text, worn gold leaf, aged red and lapis pigments. Transparent surroundings. No banner text, no square background, no parchment plaque.",
    woodcut_engraving:
      "Isolated woodcut engraving marks only with optional muted color washes: black hatching, brown ink, lapis blue shadows, aged red accents, medieval action or object scene. No rectangular plate, no printed paper, no background landscape block. Broken ink edges fade to transparent alpha.",
    illuminated_miniature:
      "Illuminated marginalia asset. Small medieval miniature scene with figures, decorative foliage, and gold leaf ornament. Cutout artwork. Transparent alpha background. No parchment, paper, page, sheet, backdrop, sky, ground, vignette, beige texture, or glow.",
    chapter_vignette:
      "Horizontal ornamental cutout only: narrow scenic band, ink wash, small figures or symbolic objects, decorative flourishes at both ends. Transparent alpha around and between forms. No rectangular frame, no parchment strip, no background tile.",
    marginalia_scene:
      "Medieval marginalia cutout scene: tiny figures, monks, travelers, knights, fools, saints, or courtly silhouettes interacting with vines and gold ornament. Transparent alpha. No page, no ground plane, no scenery backdrop.",
    botanical_marginalia:
      "Botanical marginalia cutout: curling vines, acanthus leaves, berries, flowers, small illuminated buds, worn gold accents. Transparent alpha. No paper texture, no beige fill, no rectangular crop.",
    bestiary_creature:
      "Bestiary creature cutout: dragon, griffin, basilisk, lion, serpent, strange bird, or hybrid beast in medieval ink and faded watercolor, with optional foliage or gold leaf. Transparent alpha. No habitat, no sky, no ground.",
    relic_study:
      "Isolated medieval relic or artifact study: crown, key, chalice, sword, seal, astrolabe, lantern, book clasp, coin, or sacred object. Ink outline, muted pigments, worn gold. Transparent alpha. No table, no room, no parchment.",
    scribal_diagram:
      "Scribal diagram cutout: circular cosmology, alchemical marks, routes, constellation-like dots, measuring lines, ornamental geometry. Abstract marks only, no readable letters or labels, transparent alpha, no paper sheet."
  };

  return `${base} ${variants[type] ?? ""}`;
}

export async function softenImageEdges(filePath: string, options: { force?: boolean } = {}): Promise<void> {
  const markerPath = `${filePath}.softened-v2`;
  if (!options.force) {
    try {
      await fs.access(markerPath);
      return;
    } catch {
      // First time post-processing this image.
    }
  } else {
    await fs.rm(markerPath, { force: true });
  }

  const image = sharp(filePath).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1024;
  const height = metadata.height ?? 1024;
  const feather = Math.max(48, Math.round(Math.min(width, height) * 0.08));
  const mask = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="blur"><feGaussianBlur stdDeviation="${Math.round(feather / 2)}"/></filter>
      </defs>
      <rect x="${feather}" y="${feather}" width="${width - feather * 2}" height="${height - feather * 2}" rx="${feather * 1.5}" fill="white" filter="url(#blur)"/>
    </svg>
  `);

  const output = await image
    .modulate({ saturation: 1.08, brightness: 1.01 })
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await fs.writeFile(filePath, output);
  await fs.writeFile(markerPath, "ok");
}

export async function generateImages(
  plan: ManuscriptPlan,
  hash: string,
  onProgress?: (event: ImageProgressEvent) => void,
  options: { imageLimit?: number; forceSectionIds?: string[] } = {}
): Promise<Record<string, GeneratedImage>> {
  const jobDir = path.join(PUBLIC_GENERATED_DIR, hash, IMAGE_CACHE_VERSION);
  await fs.mkdir(jobDir, { recursive: true });

  const entries: Record<string, GeneratedImage> = {};
  const imageLimit = options.imageLimit ?? 3;
  const forceSectionIds = new Set(options.forceSectionIds ?? []);
  const sectionsWithImages = plan.sections.filter((section) => section.illustration).slice(0, imageLimit);

  for (const [index, section] of sectionsWithImages.entries()) {
    const illustration = section.illustration;
    if (!illustration) continue;
    const progressIndex = index + 1;
    const progressTotal = sectionsWithImages.length;

    const fileName = `${section.id}.png`;
    const filePath = path.join(jobDir, fileName);
    const publicUrl = `/generated/${hash}/${IMAGE_CACHE_VERSION}/${fileName}`;

    try {
      await fs.access(filePath);
      if (!forceSectionIds.has(section.id)) {
        await softenImageEdges(filePath);
        onProgress?.({ type: "image-cache", sectionId: section.id, index: progressIndex, total: progressTotal });
        entries[section.id] = {
          sectionId: section.id,
          url: publicUrl,
          filePath,
          caption: illustration.caption,
          failed: false
        };
        continue;
      }
    } catch {
      // No cached image yet; continue to generation.
    }

    try {
      onProgress?.({ type: "image-start", sectionId: section.id, index: progressIndex, total: progressTotal });
      const prompt = `${illustration.prompt}

Style constraints: ${manuscriptIllustrationStyle(illustration.type)}`;

      const result = await getOpenAI().images.generate({
        model: IMAGE_MODEL,
        prompt,
        size: imageSizeForType(illustration.type),
        background: "transparent",
        output_format: "png",
        // Change OPENAI_IMAGE_QUALITY to low, medium, or high to trade cost for detail.
        quality: IMAGE_QUALITY
      } as never);

      const image = result.data?.[0] as { b64_json?: string; url?: string } | undefined;
      if (image?.b64_json) {
        await fs.writeFile(filePath, Buffer.from(image.b64_json, "base64"));
      } else if (image?.url) {
        const imageResponse = await fetch(image.url);
        if (!imageResponse.ok) throw new Error(`Image download failed: ${imageResponse.status}`);
        await fs.writeFile(filePath, Buffer.from(await imageResponse.arrayBuffer()));
      } else {
        throw new Error("OpenAI did not return image data.");
      }

      await softenImageEdges(filePath, { force: forceSectionIds.has(section.id) });

      entries[section.id] = {
        sectionId: section.id,
        url: publicUrl,
        filePath,
        caption: illustration.caption,
        failed: false
      };
      onProgress?.({ type: "image-complete", sectionId: section.id, index: progressIndex, total: progressTotal });
    } catch (error) {
      console.error(`Image generation failed for ${section.id}`, error);
      entries[section.id] = {
        sectionId: section.id,
        url: null,
        filePath: null,
        caption: illustration.caption,
        failed: true
      };
      onProgress?.({ type: "image-failed", sectionId: section.id, index: progressIndex, total: progressTotal });
    }
  }

  return entries;
}
