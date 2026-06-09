import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

export async function renderPdf(html: string, pdfPath: string): Promise<void> {
  await fs.mkdir(path.dirname(pdfPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.emulateMedia({ media: "print" });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true
    });
  } finally {
    await browser.close();
  }
}
