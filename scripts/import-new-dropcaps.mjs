import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "public", "from_user", "books", "new");
const outDir = path.join(root, "public", "assets", "manuscript", "dropcaps");
const manifestPath = path.join(root, "public", "assets", "manuscript", "manifest.json");

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

await fs.mkdir(outDir, { recursive: true });

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const files = (await fs.readdir(sourceDir))
  .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
  .sort((a, b) => a.localeCompare(b));
const existingSources = new Set((manifest.groups.dropcaps ?? []).map((item) => item.source));

let index = manifest.groups.dropcaps.length;
const added = [];

for (const name of files) {
  const filePath = path.join(sourceDir, name);
  const source = `/${path.relative(path.join(root, "public"), filePath).replaceAll("\\", "/")}`;
  if (existingSources.has(source)) continue;

  const metadata = await sharp(filePath).metadata();
  index += 1;

  const outputName = `dropcaps-${String(index).padStart(2, "0")}-${slugify(name)}.png`;
  const outputPath = path.join(outDir, outputName);
  let image = sharp(filePath).rotate();
  if (metadata.hasAlpha) {
    image = image.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 12 });
  }

  await image
    .resize({ width: 640, height: 640, fit: "inside" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

  const outputMeta = await sharp(outputPath).metadata();
  const item = {
    id: `dropcaps-${String(index).padStart(2, "0")}`,
    source,
    output: `/${path.relative(path.join(root, "public"), outputPath).replaceAll("\\", "/")}`,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    sourceHasAlpha: Boolean(metadata.hasAlpha),
    width: outputMeta.width,
    height: outputMeta.height
  };

  manifest.groups.dropcaps.push(item);
  added.push(item.output);
}

manifest.generatedAt = new Date().toISOString();
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ added }, null, 2));
