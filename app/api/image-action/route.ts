import path from "node:path";
import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { ensureIllustrationCount } from "@/lib/ensureIllustrations";
import { generateImages, softenImageEdges } from "@/lib/generateImages";
import { applyImageOverrides, readImageOverrides, writeImageOverrides } from "@/lib/imageOverrides";
import { manuscriptSettingsSchema } from "@/lib/manuscriptSettings";
import { postProcessPlan } from "@/lib/postProcessPlan";
import { renderManuscriptHtml } from "@/lib/renderManuscriptHtml";
import { renderPdf } from "@/lib/renderPdf";
import { illustrationTypes, manuscriptPlanSchema, ManuscriptPlan, PlannedIllustration } from "@/lib/manuscriptSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readPlan(hash: string) {
  const raw = await fs.readFile(path.join(process.cwd(), ".cache", "plans", `${hash}.json`), "utf8");
  return postProcessPlan(manuscriptPlanSchema.parse(JSON.parse(raw)));
}

async function writePlan(hash: string, plan: ManuscriptPlan) {
  const planPath = path.join(process.cwd(), ".cache", "plans", `${hash}.json`);
  await fs.mkdir(path.dirname(planPath), { recursive: true });
  await fs.writeFile(planPath, JSON.stringify(manuscriptPlanSchema.parse(plan), null, 2));
}

async function updateIllustrationMetadata(
  hash: string,
  sectionId: string,
  metadata: { type: string; prompt: string; caption: string }
) {
  const type = metadata.type.trim();
  const prompt = metadata.prompt.trim();
  const caption = metadata.caption.trim();
  if (!illustrationTypes.includes(type as PlannedIllustration["type"])) throw new Error("Unknown illustration type.");
  if (prompt.length < 20 || prompt.length > 1200) throw new Error("Prompt must be between 20 and 1200 characters.");
  if (caption.length < 1 || caption.length > 180) throw new Error("Caption must be between 1 and 180 characters.");

  const plan = await readPlan(hash);
  const next: ManuscriptPlan = {
    ...plan,
    sections: plan.sections.map((section) => {
      if (section.id !== sectionId) return section;
      return {
        ...section,
        illustration: {
          type: type as PlannedIllustration["type"],
          placement: section.illustration?.placement ?? "after",
          prompt,
          caption
        }
      };
    })
  };
  await writePlan(hash, next);
  return next;
}

async function rebuild(hash: string, settings: unknown) {
  const parsedSettings = manuscriptSettingsSchema.parse(settings ?? {});
  const plan = ensureIllustrationCount(await readPlan(hash), parsedSettings.imageLimit);
  const generatedImages = await generateImages(plan, hash, undefined, { imageLimit: parsedSettings.imageLimit });
  const images = await applyImageOverrides(hash, generatedImages);
  const previewHtml = await renderManuscriptHtml(plan, images, {
    imageMode: "public",
    interactive: true,
    settings: parsedSettings
  });
  const pdfHtml = await renderManuscriptHtml(plan, images, { imageMode: "data", settings: parsedSettings });
  const pdfPath = path.join(process.cwd(), "public", "generated", hash, "manuscript.pdf");
  await renderPdf(pdfHtml, pdfPath);

  return {
    hash,
    title: plan.title,
    subtitle: plan.subtitle,
    previewHtml,
    pdfUrl: `/generated/${hash}/manuscript.pdf`,
    imageFailures: Object.values(images).filter((image) => image.failed).length
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const hash = String(formData.get("hash") ?? "");
    const sectionId = String(formData.get("sectionId") ?? "");
    const action = String(formData.get("action") ?? "");
    const settings = formData.get("settings") ? JSON.parse(String(formData.get("settings"))) : {};

    if (!hash || !sectionId) throw new Error("Missing hash or section id.");

    const overrides = await readImageOverrides(hash);

    if (action === "delete") {
      overrides[sectionId] = { action: "delete" };
      await writeImageOverrides(hash, overrides);
    } else if (action === "upload") {
      const file = formData.get("file");
      if (!(file instanceof File) || file.size === 0) throw new Error("Please choose an image file.");
      const outputDir = path.join(process.cwd(), "public", "generated", hash, "custom");
      await fs.mkdir(outputDir, { recursive: true });
      const filePath = path.join(outputDir, `${sectionId}.png`);
      await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
      await softenImageEdges(filePath, { force: true });
      overrides[sectionId] = {
        action: "custom",
        url: `/generated/${hash}/custom/${sectionId}.png`,
        filePath
      };
      await writeImageOverrides(hash, overrides);
    } else if (action === "regenerate") {
      delete overrides[sectionId];
      await writeImageOverrides(hash, overrides);
      const parsedSettings = manuscriptSettingsSchema.parse(settings);
      const metadata = {
        type: String(formData.get("illustrationType") ?? ""),
        prompt: String(formData.get("prompt") ?? ""),
        caption: String(formData.get("caption") ?? "")
      };
      const updatedPlan = metadata.type || metadata.prompt || metadata.caption
        ? await updateIllustrationMetadata(hash, sectionId, metadata)
        : await readPlan(hash);
      const plan = ensureIllustrationCount(updatedPlan, parsedSettings.imageLimit);
      await generateImages(plan, hash, undefined, {
        imageLimit: parsedSettings.imageLimit,
        forceSectionIds: [sectionId]
      });
    } else if (action === "metadata") {
      await updateIllustrationMetadata(hash, sectionId, {
        type: String(formData.get("illustrationType") ?? ""),
        prompt: String(formData.get("prompt") ?? ""),
        caption: String(formData.get("caption") ?? "")
      });
    } else {
      throw new Error("Unknown image action.");
    }

    return NextResponse.json({ result: await rebuild(hash, settings) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image action failed." },
      { status: 500 }
    );
  }
}
