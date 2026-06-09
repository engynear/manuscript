import { promises as fs } from "node:fs";
import path from "node:path";
import { GeneratedImage } from "./generateImages";

type OverrideRecord =
  | { action: "delete" }
  | { action: "custom"; url: string; filePath: string; caption?: string };

type OverrideFile = Record<string, OverrideRecord>;

function overridesPath(hash: string): string {
  return path.join(process.cwd(), "public", "generated", hash, "image-overrides.json");
}

export async function readImageOverrides(hash: string): Promise<OverrideFile> {
  try {
    return JSON.parse(await fs.readFile(overridesPath(hash), "utf8")) as OverrideFile;
  } catch {
    return {};
  }
}

export async function writeImageOverrides(hash: string, overrides: OverrideFile): Promise<void> {
  await fs.mkdir(path.dirname(overridesPath(hash)), { recursive: true });
  await fs.writeFile(overridesPath(hash), JSON.stringify(overrides, null, 2));
}

export async function applyImageOverrides(
  hash: string,
  images: Record<string, GeneratedImage>
): Promise<Record<string, GeneratedImage>> {
  const overrides = await readImageOverrides(hash);
  const next = { ...images };

  for (const [sectionId, override] of Object.entries(overrides)) {
    if (override.action === "delete") {
      delete next[sectionId];
    } else {
      const current = next[sectionId];
      next[sectionId] = {
        sectionId,
        url: override.url,
        filePath: override.filePath,
        caption: override.caption ?? current?.caption ?? "",
        failed: false
      };
    }
  }

  return next;
}
