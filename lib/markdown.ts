import { unified } from "unified";
import remarkParse from "remark-parse";
import Slugger from "github-slugger";

type MdNode = {
  type: string;
  value?: string;
  depth?: number;
  children?: MdNode[];
  position?: {
    start: { line: number };
    end: { line: number };
  };
};

export type NormalizedSection = {
  id: string;
  level: number;
  originalHeading: string;
  bodyMarkdown: string;
};

export type NormalizedMarkdown = {
  source: string;
  sections: NormalizedSection[];
};

function nodeText(node: MdNode): string {
  if (typeof node.value === "string") return node.value;
  return node.children?.map(nodeText).join("") ?? "";
}

export function normalizeMarkdown(source: string): NormalizedMarkdown {
  const cleaned = source.replace(/\r\n?/g, "\n").trim();
  if (!cleaned) {
    throw new Error("Please provide Markdown text or upload a non-empty .md file.");
  }

  const tree = unified().use(remarkParse).parse(cleaned) as MdNode;
  const lines = cleaned.split("\n");
  const headings = (tree.children ?? []).filter((node) => node.type === "heading" && node.position);
  const slugger = new Slugger();

  if (headings.length === 0) {
    return {
      source: cleaned,
      sections: [
        {
          id: "manuscript",
          level: 1,
          originalHeading: "Manuscript",
          bodyMarkdown: cleaned
        }
      ]
    };
  }

  return {
    source: cleaned,
    sections: headings.map((heading, index) => {
      const startLine = heading.position?.end.line ?? 1;
      const nextStart = headings[index + 1]?.position?.start.line ?? lines.length + 1;
      const originalHeading = nodeText(heading).trim() || `Section ${index + 1}`;

      return {
        id: slugger.slug(originalHeading) || `section-${index + 1}`,
        level: Math.min(Math.max(heading.depth ?? 2, 1), 4),
        originalHeading,
        bodyMarkdown: lines.slice(startLine, nextStart - 1).join("\n").trim()
      };
    })
  };
}
