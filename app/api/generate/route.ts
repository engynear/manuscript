import path from "node:path";
import { promises as fs } from "node:fs";
import { ensureIllustrationCount } from "@/lib/ensureIllustrations";
import { contentHash, generatePlan } from "@/lib/generatePlan";
import { generateImages } from "@/lib/generateImages";
import { applyImageOverrides } from "@/lib/imageOverrides";
import { normalizeMarkdown } from "@/lib/markdown";
import { manuscriptSettingsSchema } from "@/lib/manuscriptSettings";
import { postProcessPlan } from "@/lib/postProcessPlan";
import { renderManuscriptHtml } from "@/lib/renderManuscriptHtml";
import { renderPdf } from "@/lib/renderPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProgressPayload = {
  type: "progress" | "done" | "error";
  step?: string;
  message?: string;
  detail?: string;
  progress?: number;
  result?: {
    hash: string;
    title: string;
    subtitle?: string;
    previewHtml: string;
    pdfUrl: string;
    imageFailures: number;
  };
};

function streamEvent(controller: ReadableStreamDefaultController<Uint8Array>, payload: ProgressPayload) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
}

export async function POST(request: Request) {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        streamEvent(controller, {
          type: "progress",
          step: "read",
          message: "Reading source Markdown",
          progress: 4
        });

        const formData = await request.formData();
        const pasted = String(formData.get("markdown") ?? "").trim();
        const file = formData.get("file");
        const settings = manuscriptSettingsSchema.parse(
          formData.get("settings") ? JSON.parse(String(formData.get("settings"))) : {}
        );

        let markdown = pasted;
        if (file instanceof File && file.size > 0) {
          if (!file.name.toLowerCase().endsWith(".md")) {
            throw new Error("Please upload a Markdown file ending in .md.");
          }
          markdown = await file.text();
        }

        streamEvent(controller, {
          type: "progress",
          step: "normalize",
          message: "Parsing and normalizing Markdown",
          progress: 10
        });

        const normalized = normalizeMarkdown(markdown);
        const hash = contentHash(normalized.source);

        streamEvent(controller, {
          type: "progress",
          step: "plan",
          message: "Preparing manuscript plan",
          progress: 18
        });

        const plan = ensureIllustrationCount(postProcessPlan(await generatePlan(normalized, hash)), settings.imageLimit);
        const imageSections = plan.sections.filter((section) => section.illustration).slice(0, settings.imageLimit);

        streamEvent(controller, {
          type: "progress",
          step: "images",
          message: imageSections.length
            ? `Preparing ${imageSections.length} illustration${imageSections.length === 1 ? "" : "s"}`
            : "No illustrations requested for this manuscript",
          progress: 30
        });

        const generatedImages = await generateImages(plan, hash, (event) => {
          const base = imageSections.length ? 32 + Math.round((event.index - 1) * (34 / imageSections.length)) : 56;
          const after = imageSections.length ? 32 + Math.round(event.index * (34 / imageSections.length)) : 56;
          const messageByType = {
            "image-cache": `Illustration ${event.index}/${event.total} loaded from cache`,
            "image-start": `Generating illustration ${event.index}/${event.total}`,
            "image-complete": `Illustration ${event.index}/${event.total} complete`,
            "image-failed": `Illustration ${event.index}/${event.total} failed; using ornament fallback`
          };
          streamEvent(controller, {
            type: "progress",
            step: event.type,
            message: messageByType[event.type],
            detail: event.sectionId,
            progress: event.type === "image-start" ? base : after
          });
        }, { imageLimit: settings.imageLimit });
        const images = await applyImageOverrides(hash, generatedImages);

        streamEvent(controller, {
          type: "progress",
          step: "html",
          message: "Composing paginated manuscript HTML",
          progress: 72
        });

        const previewHtml = await renderManuscriptHtml(plan, images, { imageMode: "public", interactive: true, settings });
        const pdfHtml = await renderManuscriptHtml(plan, images, { imageMode: "data", settings });

        streamEvent(controller, {
          type: "progress",
          step: "pdf",
          message: "Binding PDF with Playwright",
          progress: 86
        });

        const outputDir = path.join(process.cwd(), "public", "generated", hash);
        const pdfPath = path.join(outputDir, "manuscript.pdf");
        await fs.mkdir(outputDir, { recursive: true });
        await renderPdf(pdfHtml, pdfPath);

        streamEvent(controller, {
          type: "done",
          progress: 100,
          message: "Manuscript complete",
          result: {
            hash,
            title: plan.title,
            subtitle: plan.subtitle,
            previewHtml,
            pdfUrl: `/generated/${hash}/manuscript.pdf`,
            imageFailures: Object.values(images).filter((image) => image.failed).length
          }
        });
      } catch (error) {
        console.error(error);
        streamEvent(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "Something went wrong while forging the manuscript."
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}
