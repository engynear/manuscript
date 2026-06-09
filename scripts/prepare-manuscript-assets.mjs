import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourceDir = path.join(root, "public", "from_user");
const outDir = path.join(root, "public", "assets", "manuscript");
const rasterExt = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const groups = {
  papers: [],
  marginOrnaments: [],
  dividers: [],
  dropcaps: [],
  corners: [],
  illustrations: [],
  misc: []
};

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    if (entry.isFile() && rasterExt.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }
  return files;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function classify(filePath) {
  const rel = path.relative(sourceDir, filePath).replaceAll("\\", "/").toLowerCase();
  if (rel.includes("back")) return "papers";
  if (rel.includes("ornament") || rel.includes("vineette") || rel.includes("vine")) return "marginOrnaments";
  if (rel.includes("horizontal") || rel.includes("divider") || rel.includes("split")) return "dividers";
  if (rel.includes("book") || rel.includes("initial") || rel.includes("dropcap")) return "dropcaps";
  if (rel.includes("corner")) return "corners";
  if (rel.includes("content") || rel.includes("map") || rel.includes("miniature") || rel.includes("vignette")) {
    return "illustrations";
  }
  return "misc";
}

async function ensureDirs() {
  await fs.mkdir(outDir, { recursive: true });
  await Promise.all(Object.keys(groups).map((group) => fs.mkdir(path.join(outDir, group), { recursive: true })));
}

async function trimTransparent(image, metadata, threshold = 12) {
  if (!metadata.hasAlpha) return image;
  return image.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold });
}

async function processPaper(filePath, index) {
  const name = `paper-${String(index + 1).padStart(2, "0")}-${slugify(path.basename(filePath))}.jpg`;
  const outPath = path.join(outDir, "papers", name);
  await sharp(filePath)
    .rotate()
    .resize(1654, 2339, { fit: "cover", position: "center" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);
  return outPath;
}

async function processTransparentGroup(filePath, group, index) {
  const source = sharp(filePath).rotate();
  const metadata = await source.metadata();
  const trimmed = await trimTransparent(source, metadata);
  const size =
    group === "marginOrnaments"
      ? { width: 360, height: 2200, fit: "inside" }
      : group === "dividers"
        ? { width: 1200, height: 180, fit: "inside" }
        : { width: 640, height: 640, fit: "inside" };

  const name = `${group}-${String(index + 1).padStart(2, "0")}-${slugify(path.basename(filePath))}.png`;
  const outPath = path.join(outDir, group, name);
  await trimmed
    .resize(size)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);
  return outPath;
}

async function processIllustration(filePath, index) {
  const metadata = await sharp(filePath).metadata();
  const wide = metadata.width && metadata.height ? metadata.width / metadata.height > 1.25 : false;
  const target = wide ? { width: 1400, height: 820 } : { width: 960, height: 960 };
  const name = `illustration-${String(index + 1).padStart(2, "0")}-${slugify(path.basename(filePath))}.jpg`;
  const outPath = path.join(outDir, "illustrations", name);
  await sharp(filePath)
    .rotate()
    .resize(target.width, target.height, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outPath);
  return outPath;
}

async function makeContactSheet(items, group) {
  if (items.length === 0) return null;
  const thumbs = await Promise.all(
    items.map(async (item) => {
      const buffer = await sharp(item.outputPath)
        .resize(220, 220, { fit: "contain", background: { r: 244, g: 226, b: 188, alpha: 1 } })
        .extend({ top: 8, bottom: 38, left: 8, right: 8, background: "#f4e2bc" })
        .composite([
          {
            input: Buffer.from(
              `<svg width="236" height="266"><text x="8" y="252" font-size="12" fill="#2b190d">${item.id}</text></svg>`
            ),
            top: 0,
            left: 0
          }
        ])
        .png()
        .toBuffer();
      return buffer;
    })
  );

  const columns = Math.min(4, thumbs.length);
  const rows = Math.ceil(thumbs.length / columns);
  const width = columns * 236;
  const height = rows * 266;
  const composite = thumbs.map((input, index) => ({
    input,
    left: (index % columns) * 236,
    top: Math.floor(index / columns) * 266
  }));
  const outPath = path.join(outDir, `${group}-contact.png`);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: "#d9bd82"
    }
  })
    .composite(composite)
    .png()
    .toFile(outPath);
  return outPath;
}

await ensureDirs();
const files = await walk(sourceDir);
const manifest = {
  generatedAt: new Date().toISOString(),
  sourceDir: "/from_user",
  assetsDir: "/assets/manuscript",
  groups: {}
};

for (const file of files) {
  groups[classify(file)].push(file);
}

for (const [group, groupFiles] of Object.entries(groups)) {
  manifest.groups[group] = [];
  let outputIndex = 0;
  for (const file of groupFiles) {
    const metadata = await sharp(file).metadata();
    let outputPath;
    if (group === "papers") outputPath = await processPaper(file, outputIndex);
    else if (group === "illustrations" || group === "misc") outputPath = await processIllustration(file, outputIndex);
    else outputPath = await processTransparentGroup(file, group, outputIndex);

    const outputMeta = await sharp(outputPath).metadata();
    const item = {
      id: `${group}-${String(outputIndex + 1).padStart(2, "0")}`,
      source: `/${path.relative(path.join(root, "public"), file).replaceAll("\\", "/")}`,
      output: `/${path.relative(path.join(root, "public"), outputPath).replaceAll("\\", "/")}`,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sourceHasAlpha: Boolean(metadata.hasAlpha),
      width: outputMeta.width,
      height: outputMeta.height
    };
    manifest.groups[group].push(item);
    outputIndex += 1;
  }
  await makeContactSheet(
    manifest.groups[group].map((item) => ({
      ...item,
      outputPath: path.join(root, "public", item.output)
    })),
    group
  );
}

await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(manifest.groups).map(([key, value]) => [key, value.length])), null, 2));
