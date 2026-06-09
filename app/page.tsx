"use client";

/* eslint-disable @next/next/no-img-element -- Dynamic local asset previews come from the manuscript manifest. */

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Locale = "en" | "ru";

type GenerateResult = {
  hash: string;
  title: string;
  subtitle?: string;
  previewHtml: string;
  pdfUrl: string;
  imageFailures: number;
};

type ManuscriptSettings = {
  imageLimit: number;
  chapterStart: "auto" | "newPage" | "inline";
  paper: string;
  ornament: string;
  divider: string;
  titleDivider: string;
  dropcap: string;
  fontStyle: "garamond" | "monomakh" | "ponomar" | "menaion" | "fedorovsk" | "ruslan" | "uncial" | "almendra";
};

type ProgressEvent = {
  type: "progress" | "done" | "error";
  step?: string;
  message?: string;
  detail?: string;
  progress?: number;
  result?: GenerateResult;
};

type AssetItem = {
  id: string;
  output: string;
  width?: number;
  height?: number;
};

type AssetManifest = {
  groups: Record<string, AssetItem[]>;
};

type IllustrationDraft = {
  sectionId: string;
  illustrationType: string;
  prompt: string;
  caption: string;
};

type CaptionDraft = {
  sectionId: string;
  illustrationType: string;
  prompt: string;
  caption: string;
};

const illustrationTypeOptions = [
  "map",
  "coat_of_arms",
  "woodcut_engraving",
  "illuminated_miniature",
  "chapter_vignette",
  "marginalia_scene",
  "botanical_marginalia",
  "bestiary_creature",
  "relic_study",
  "scribal_diagram"
];

const sampleMarkdown = `# The Road Beneath the Elder Moon

The caravan reached the old bridge at dusk, when the river below had turned black as poured ink.

## The Broken Toll

Mara found the tollkeeper's ledger nailed shut with a silver thorn. Inside were seven names, each written in a different hand.

## A Map of Ash

Beyond the bridge lay the barrow-road, the ruined watchfires, and the pass no king had claimed for a hundred winters.`;

const copy = {
  en: {
    tagline: "Forge words into a print-ready fantasy manuscript.",
    inputTitle: "Input Manuscript",
    inputText: "Paste Markdown below or upload a `.md` file.",
    markdown: "Markdown",
    upload: "Upload .md File",
    uploaded: "Loaded",
    supports: "Supports standard Markdown.",
    chars: "chars",
    generate: "Generate Manuscript",
    generating: "Generating Manuscript",
    forgeWorking: "Generation in progress",
    forgeWorkingText: "The backend reports each step as it plans, illustrates, and binds the PDF.",
    previewTitle: "Forged Manuscript",
    previewText: "Preview the same HTML that is printed into the final PDF.",
    waitingTitle: "Ready to forge",
    emptyTitle: "The manuscript will appear here.",
    emptyText: "Choose a style, paste a draft, then generate a paginated PDF.",
    illuminating: "Binding the manuscript",
    illuminatingText: "Preview will appear when the PDF is ready.",
    download: "Download PDF",
    selected: "Selected",
    settings: "Settings",
    close: "Close",
    applySettings: "Use These Settings",
    settingsTitle: "Manuscript Settings",
    settingsText: "Pick visual assets with previews. These affect new generations and image edits.",
    imageCount: "Illustrations",
    imageCountText: "Maximum generated images in one manuscript.",
    chapterStart: "Chapter Starts",
    chapterStartText: "Choose how level 1-2 chapters flow across pages.",
    chapterAuto: "Auto",
    chapterNewPage: "New Page",
    chapterInline: "Inline",
    fontStyle: "Manuscript Font",
    fontStyleText: "Typeface used for body text and chapter headings.",
    paper: "Paper",
    paperText: "A4 page background used in preview and PDF.",
    ornament: "Margin Ornament",
    ornamentText: "Fixed decoration on the left side of each page.",
    divider: "Section Divider",
    dividerText: "Used between meaningful sections only.",
    titleDivider: "Title Divider",
    titleDividerText: "Used near the title page.",
    dropcap: "Drop Cap",
    dropcapText: "Frame style for illuminated first letters.",
    pagePreview: "Final Page Preview",
    pagePreviewText: "A compact sample of paper, ornament, divider, and drop cap working together.",
    sampleHeading: "Chapter I",
    sampleLine: "A fair wind moved across the old vellum, carrying ink, ash, and rumor.",
    sampleCaption: "The chosen visual language is shown together here.",
    noAssets: "No assets found",
    imageFailure: "illustration failed and was replaced with an ornamental block.",
    imageFailures: "illustrations failed and were replaced with ornamental blocks.",
    defaultError: "The forge failed to complete the manuscript."
  },
  ru: {
    tagline: "Превращает текст в готовую fantasy-рукопись для печати.",
    inputTitle: "Исходный текст",
    inputText: "Вставь Markdown ниже или загрузи `.md` файл.",
    markdown: "Markdown",
    upload: "Загрузить .md",
    uploaded: "Загружен",
    supports: "Поддерживается обычный Markdown.",
    chars: "симв.",
    generate: "Создать рукопись",
    generating: "Создаю рукопись",
    forgeWorking: "Генерация идёт",
    forgeWorkingText: "Backend показывает шаги: план, иллюстрации, сборка PDF.",
    previewTitle: "Готовая рукопись",
    previewText: "Это тот же HTML, который печатается в итоговый PDF.",
    waitingTitle: "Готово к работе",
    emptyTitle: "Рукопись появится здесь.",
    emptyText: "Выбери стиль, вставь текст и запусти генерацию PDF.",
    illuminating: "Собираю рукопись",
    illuminatingText: "Предпросмотр появится, когда PDF будет готов.",
    download: "Скачать PDF",
    selected: "Выбран",
    settings: "Настройки",
    close: "Закрыть",
    applySettings: "Применить настройки",
    settingsTitle: "Настройки манускрипта",
    settingsText: "Выбирай ассеты визуально. Они применятся к новой генерации и правкам картинок.",
    imageCount: "Иллюстрации",
    imageCountText: "Максимум сгенерированных картинок в одном манускрипте.",
    chapterStart: "Начало глав",
    chapterStartText: "Как главы уровня 1-2 переходят между страницами.",
    chapterAuto: "Авто",
    chapterNewPage: "С новой страницы",
    chapterInline: "Подряд",
    fontStyle: "Шрифт",
    fontStyleText: "Гарнитура для основного текста и заголовков.",
    paper: "Бумага",
    paperText: "Фон A4-страницы в предпросмотре и PDF.",
    ornament: "Орнамент на полях",
    ornamentText: "Неподвижное украшение слева на каждой странице.",
    divider: "Разделитель секций",
    dividerText: "Ставится только между значимыми частями.",
    titleDivider: "Разделитель титула",
    titleDividerText: "Используется рядом с титульной частью.",
    dropcap: "Буквица",
    dropcapText: "Рамка для украшенной первой буквы.",
    pagePreview: "Превью страницы",
    pagePreviewText: "Мини-макет показывает бумагу, орнамент, разделители и буквицу вместе.",
    sampleHeading: "Глава I",
    sampleLine: "Тихий ветер прошёл по старому пергаменту, неся чернила, пепел и слухи.",
    sampleCaption: "Так выбранные элементы смотрятся вместе.",
    noAssets: "Ассеты не найдены",
    imageFailure: "иллюстрация не сгенерировалась и заменена орнаментальным блоком.",
    imageFailures: "иллюстрации не сгенерировались и заменены орнаментальными блоками.",
    defaultError: "Не удалось создать рукопись."
  }
};

const fallbackProgress = {
  en: "Waiting for backend progress...",
  ru: "Жду прогресс от backend..."
};

const defaultSettings: ManuscriptSettings = {
  imageLimit: 0,
  chapterStart: "auto",
  paper: "/assets/manuscript/papers/paper-02-burnt-edge-parchment-subtle2.jpg",
  ornament: "/assets/manuscript/marginOrnaments/marginOrnaments-09-ivy-vine-with-red-berries.png",
  divider: "/assets/manuscript/dividers/dividers-04-red-and-gold-gothic-divider.png",
  titleDivider: "/assets/manuscript/dividers/dividers-05-simple-gold-ink-flourish.png",
  dropcap: "/assets/manuscript/dropcaps/dropcaps-03-red-gold-illuminated-initial-frame.png",
  fontStyle: "garamond"
};
const assetSettingKeys = ["paper", "ornament", "divider", "titleDivider", "dropcap"] as const;

const imageLimitOptions = [0, 1, 2, 3, 4, 6, 8];
const fontOptions: Array<{
  value: ManuscriptSettings["fontStyle"];
  label: string;
  description: string;
  family: string;
  preview: "latin" | "ru";
}> = [
  {
    value: "garamond",
    label: "EB Garamond",
    description: "Readable literary manuscript",
    family: "\"Forge EB Garamond\", Georgia, serif",
    preview: "latin"
  },
  {
    value: "monomakh",
    label: "Monomakh Unicode",
    description: "Old Slavic display hand",
    family: "\"Forge Monomakh\", \"Forge EB Garamond\", serif",
    preview: "ru"
  },
  {
    value: "ponomar",
    label: "Ponomar Unicode",
    description: "Church Slavonic book hand",
    family: "\"Forge Ponomar\", \"Forge EB Garamond\", serif",
    preview: "ru"
  },
  {
    value: "menaion",
    label: "Menaion Unicode",
    description: "Liturgical manuscript texture",
    family: "\"Forge Menaion\", \"Forge EB Garamond\", serif",
    preview: "ru"
  },
  {
    value: "fedorovsk",
    label: "Fedorovsk Unicode",
    description: "Printed old Cyrillic tone",
    family: "\"Forge Fedorovsk\", \"Forge EB Garamond\", serif",
    preview: "ru"
  },
  {
    value: "ruslan",
    label: "Ruslan Display",
    description: "Decorative old-script Cyrillic and Latin",
    family: "\"Forge Ruslan\", \"Forge EB Garamond\", serif",
    preview: "ru"
  },
  {
    value: "uncial",
    label: "Uncial Antiqua",
    description: "Latin uncial manuscript hand",
    family: "\"Forge Uncial Antiqua\", \"Forge EB Garamond\", serif",
    preview: "latin"
  },
  {
    value: "almendra",
    label: "Almendra Display",
    description: "Latin fantasy calligraphic display",
    family: "\"Forge Almendra Display\", \"Forge EB Garamond\", serif",
    preview: "latin"
  }
];

function assetName(item?: AssetItem) {
  if (!item) return "";
  return item.output
    .split("/")
    .pop()
    ?.replace(/\.(png|jpg|jpeg|webp)$/i, "")
    .replace(/^(paper|marginOrnaments|dividers|dropcaps)-\d+-/i, "")
    .replace(/-/g, " ")
    ?? item.id;
}

function dropcapBackground(dropcapPath: string) {
  const normalized = dropcapPath.toLowerCase();
  if (normalized.includes("aged-ink")) return "#182235";
  if (normalized.includes("cintric")) return "#102b61";
  if (normalized.includes("herbal")) return "#183a22";
  if (normalized.includes("royal2")) return "#0e2e73";
  if (normalized.includes("royal")) return "#6d120c";
  if (normalized.includes("slavic")) return "#120f0b";
  if (normalized.includes("vine")) return "#d5aa46";
  if (normalized.includes("blue")) return "#123044";
  if (normalized.includes("dark") || normalized.includes("woodcut")) return "#1f1712";
  return "#5a150d";
}

function inkThemeForPaper(paperPath: string) {
  const normalized = paperPath.toLowerCase();
  if (normalized.includes("dark") || normalized.includes("stained-alchemist")) {
    return {
      ink: "#f5dfaf",
      fadedInk: "#e0bd7b",
      red: "#ffd08a"
    };
  }
  return {
    ink: "#241105",
    fadedInk: "#553217",
    red: "#7a170f"
  };
}

function previewWithPendingImage(previewHtml: string, sectionId: string, label: string) {
  const doc = new DOMParser().parseFromString(previewHtml, "text/html");
  const figure = Array.from(doc.querySelectorAll("figure[data-section-id]")).find(
    (node) => node.getAttribute("data-section-id") === sectionId
  );
  if (!figure) return previewHtml;

  const controls = figure.querySelector(".figure-controls")?.cloneNode(true);
  figure.className = "manuscript-figure is-pending";
  figure.replaceChildren();
  if (controls) figure.appendChild(controls);

  const placeholder = doc.createElement("div");
  placeholder.className = "manuscript-placeholder is-loading";
  const ornament = doc.createElement("span");
  ornament.setAttribute("aria-hidden", "true");
  const text = doc.createElement("span");
  text.textContent = label;
  placeholder.append(ornament, text);
  figure.appendChild(placeholder);

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function previewWithoutImage(previewHtml: string, sectionId: string) {
  const doc = new DOMParser().parseFromString(previewHtml, "text/html");
  const figure = Array.from(doc.querySelectorAll("figure[data-section-id]")).find(
    (node) => node.getAttribute("data-section-id") === sectionId
  );
  figure?.remove();
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("en");
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [markdownFileName, setMarkdownFileName] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [settings, setSettings] = useState<ManuscriptSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manifest, setManifest] = useState<AssetManifest | null>(null);
  const [imageActionStatus, setImageActionStatus] = useState("");
  const [illustrationDraft, setIllustrationDraft] = useState<IllustrationDraft | null>(null);
  const [captionDraft, setCaptionDraft] = useState<CaptionDraft | null>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const markdownFileInputRef = useRef<HTMLInputElement | null>(null);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingPreviewSectionRef = useRef<string | null>(null);

  const t = copy[locale];
  const previewInk = inkThemeForPaper(settings.paper);
  const canSubmit = useMemo(() => markdown.trim().length > 0, [markdown]);
  const lineCount = Math.max(Math.min(markdown.split("\n").length, 220), 24);
  const selectedFont = fontOptions.find((font) => font.value === settings.fontStyle) ?? fontOptions[0];

  useEffect(() => {
    fetch("/assets/manuscript/manifest.json")
      .then((response) => response.json())
      .then((loadedManifest: AssetManifest) => {
        setManifest(loadedManifest);
        const available = new Set(Object.values(loadedManifest.groups).flat().map((asset) => asset.output));
        setSettings((current) => {
          const next = { ...current };
          let changed = false;
          for (const key of assetSettingKeys) {
            if (!available.has(next[key])) {
              next[key] = defaultSettings[key];
              changed = true;
            }
          }
          return changed ? next : current;
        });
      })
      .catch(() => setManifest(null));
  }, []);

  useEffect(() => {
    const sectionId = pendingPreviewSectionRef.current;
    const iframe = previewIframeRef.current;
    if (!sectionId || !iframe || !result) return;

    const timeout = window.setTimeout(() => {
      const doc = iframe.contentDocument;
      const figure = doc?.querySelector(`figure[data-section-id="${CSS.escape(sectionId)}"]`);
      figure?.scrollIntoView({ block: "center" });
      pendingPreviewSectionRef.current = null;
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [result]);

  async function onMarkdownFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError("");
    event.target.value = "";
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".md")) {
      setError("Please choose a Markdown file ending in .md.");
      return;
    }
    setMarkdown(await selected.text());
    setMarkdownFileName(selected.name);
  }

  function addProgress(event: ProgressEvent) {
    setProgressEvents((events) => [...events.slice(-9), event]);
    if (typeof event.progress === "number") setProgress(event.progress);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isLoading) return;

    setIsLoading(true);
    setError("");
    setResult(null);
    setProgress(0);
    setProgressEvents([{ type: "progress", message: fallbackProgress[locale], progress: 1 }]);

    const formData = new FormData();
    formData.set("markdown", markdown);
    formData.set("settings", JSON.stringify(settings));

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? t.defaultError);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const payload = JSON.parse(line) as ProgressEvent;
          addProgress(payload);
          if (payload.type === "error") throw new Error(payload.message ?? t.defaultError);
          if (payload.type === "done" && payload.result) setResult(payload.result);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.defaultError);
    } finally {
      setIsLoading(false);
    }
  }

  const runImageAction = useCallback(async (
    action: string,
    sectionId: string,
    fileToUpload?: File,
    metadata?: Omit<IllustrationDraft, "sectionId">
  ) => {
    if (!result) return;
    const previousResult = result;
    const pendingLabel =
      action === "regenerate"
        ? "Regenerating illustration..."
        : action === "upload"
          ? "Preparing uploaded illustration..."
          : action === "metadata"
            ? "Updating illustration caption..."
            : "Removing illustration...";
    pendingPreviewSectionRef.current = sectionId;
    setImageActionStatus(pendingLabel);
    setResult({
      ...result,
      previewHtml:
        action === "delete"
          ? previewWithoutImage(result.previewHtml, sectionId)
          : action === "metadata"
            ? result.previewHtml
            : previewWithPendingImage(result.previewHtml, sectionId, pendingLabel)
    });
    const formData = new FormData();
    formData.set("hash", result.hash);
    formData.set("sectionId", sectionId);
    formData.set("action", action);
    formData.set("settings", JSON.stringify(settings));
    if (fileToUpload) formData.set("file", fileToUpload);
    if (metadata) {
      formData.set("illustrationType", metadata.illustrationType);
      formData.set("prompt", metadata.prompt);
      formData.set("caption", metadata.caption);
    }

    try {
      const response = await fetch("/api/image-action", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? t.defaultError);
      setResult(payload.result);
      setImageActionStatus("");
    } catch (caught) {
      setResult(previousResult);
      setImageActionStatus(caught instanceof Error ? caught.message : t.defaultError);
    }
  }, [result, settings, t.defaultError]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.source !== "manuscript-preview" || !result) return;
      const sectionId = String(event.data.sectionId ?? "");
      const action = String(event.data.action ?? "");
      if (!sectionId) return;
      if (action === "regenerate") {
        setIllustrationDraft({
          sectionId,
          illustrationType: String(event.data.illustrationType || "illuminated_miniature"),
          prompt: String(event.data.prompt || ""),
          caption: String(event.data.caption || "")
        });
        return;
      }
      if (action === "caption") {
        setCaptionDraft({
          sectionId,
          illustrationType: String(event.data.illustrationType || "illuminated_miniature"),
          prompt: String(event.data.prompt || ""),
          caption: String(event.data.caption || "")
        });
        return;
      }
      if (action === "upload") {
        uploadTargetRef.current = sectionId;
        uploadInputRef.current?.click();
        return;
      }
      void runImageAction(action, sectionId);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [result, runImageAction]);

  function setSetting<Key extends keyof ManuscriptSettings>(key: Key, value: ManuscriptSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function selectedAsset(group: string, value: string) {
    return (manifest?.groups[group] ?? []).find((item) => item.output === value);
  }

  function assetPicker(
    label: string,
    description: string,
    key: keyof Omit<ManuscriptSettings, "imageLimit">,
    group: string,
    mode: "paper" | "wide" | "vertical" | "square"
  ) {
    const items = (manifest?.groups[group] ?? []).filter((item) => {
      // The first divider is a scenic vignette, not a clean ornamental rule, so hide it from divider choices.
      if (group === "dividers" && item.id === "dividers-01") return false;
      if (group === "marginOrnaments" && item.output.toLowerCase().includes("vineette")) return false;
      return true;
    });
    const current = selectedAsset(group, settings[key]);

    return (
      <section className="border-t border-[#d4bd8d] pt-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-[#2a170c]">{label}</h3>
            <p className="text-sm leading-5 text-[#6a5134]">{description}</p>
          </div>
          <span className="text-xs text-[#7d603b]">{assetName(current)}</span>
        </div>

        {items.length ? (
          <div className="grid max-h-64 grid-cols-2 gap-3 overflow-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => {
              const isSelected = settings[key] === item.output;
              return (
                <button
                  key={item.output}
                  type="button"
                  onClick={() => setSetting(key, item.output)}
                  className={`group min-h-32 border bg-[#fbf3dd] p-2 text-left transition hover:border-[#7a1b12] hover:bg-[#fff8e6] focus:outline-none focus:ring-2 focus:ring-[#7a1b12] ${
                    isSelected ? "border-[#7a1b12] shadow-[inset_0_0_0_2px_rgba(122,27,18,0.28)]" : "border-[#c9ae79]"
                  }`}
                >
                  <span
                    className={`grid h-24 place-items-center overflow-hidden bg-[#efe0bd] ${
                      mode === "paper" ? "" : "bg-[linear-gradient(45deg,#ead9ad_25%,#f6ebcc_25%,#f6ebcc_50%,#ead9ad_50%,#ead9ad_75%,#f6ebcc_75%)] bg-[length:18px_18px]"
                    }`}
                    style={mode === "square" ? { backgroundColor: dropcapBackground(item.output), backgroundImage: "none" } : undefined}
                  >
                    {mode === "paper" ? (
                      <span
                        className="block h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${item.output})` }}
                      />
                    ) : (
                      <img
                        src={item.output}
                        alt={assetName(item)}
                        className={`max-h-full max-w-full object-contain transition group-hover:scale-[1.03] ${
                          mode === "wide" ? "w-full" : mode === "vertical" ? "h-full" : "size-20"
                        }`}
                      />
                    )}
                  </span>
                  <span className="mt-2 block truncate text-xs font-semibold text-[#3a2110]">{assetName(item)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-[#c9ae79] bg-[#fbf3dd] p-4 text-sm text-[#6a5134]">{t.noAssets}</div>
        )}
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-[#2a170c] text-[#251408]">
      <div className="min-h-screen bg-[linear-gradient(180deg,#efe0bd_0%,#dfc48b_48%,#c99f5d_100%)]">
        <header className="border-b border-[#291208] bg-[#3a0d09] text-[#f8e8c2] shadow-[0_10px_24px_rgba(34,16,8,0.22)]">
          <div className="mx-auto flex max-w-[1540px] flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="grid size-14 shrink-0 place-items-center border-4 border-double border-[#c9973e] bg-[#f4e1b7] font-serif text-4xl font-black leading-none text-[#5f140e] shadow-inner">
                M
              </div>
              <div>
                <h1 className="font-serif text-4xl font-bold leading-none text-wrap sm:text-5xl">Manuscript Forge</h1>
                <p className="mt-1 text-sm text-[#f7dca3]">{t.tagline}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="min-h-10 border border-[#d6a84f] bg-[#5c130e] px-4 text-sm font-bold text-[#fff1ce] transition hover:bg-[#75190f] focus:outline-none focus:ring-2 focus:ring-[#f8d47a]"
              >
                {t.settings}
              </button>
              <div className="flex border border-[#f8e8c2]/24">
                {(["en", "ru"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLocale(lang)}
                    className={`min-h-10 px-3 text-xs font-bold uppercase tracking-[0.12em] ${
                      locale === lang ? "bg-[#f8e8c2] text-[#4a100b]" : "text-[#f8e8c2] hover:bg-[#f8e8c2]/10"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <form
          onSubmit={onSubmit}
          className="mx-auto grid max-w-[1540px] items-start gap-4 bg-[#f3e6c6]/86 p-4 shadow-[0_28px_70px_rgba(43,25,13,0.22)] lg:grid-cols-[minmax(360px,0.72fr)_minmax(520px,1.28fr)]"
        >
          <section className="border border-[#b69862] bg-[#fbf1d9]/78 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center border border-[#b69862] bg-[#fff7df] text-lg font-bold text-[#6b160f]">1</span>
              <div>
                <h2 className="font-serif text-2xl font-bold">{t.inputTitle}</h2>
                <p className="mt-1 text-sm leading-6 text-[#5c4328]">{t.inputText}</p>
              </div>
            </div>

            <div className="mt-5 flex gap-3 border-b border-[#b69862]">
              <span className="bg-[#65130d] px-4 py-2 text-sm font-semibold text-[#fff1ce]">{t.markdown}</span>
              <button
                type="button"
                onClick={() => markdownFileInputRef.current?.click()}
                className="px-3 py-2 text-sm font-semibold text-[#5c4328] underline-offset-4 transition hover:bg-[#fff7df] hover:text-[#71150f] hover:underline focus:outline-none focus:ring-2 focus:ring-[#71150f]"
              >
                {t.upload}
              </button>
            </div>

            <div className="mt-3 grid h-[520px] grid-cols-[44px_1fr] overflow-hidden border border-[#b69862] bg-[#fff7df]">
              <div className="select-none overflow-hidden border-r border-[#d2bb8e] bg-[#efe0bc] py-3 text-right font-mono text-xs leading-6 text-[#8b7653]">
                {Array.from({ length: lineCount }).map((_, index) => (
                  <div key={index} className="pr-3">
                    {index + 1}
                  </div>
                ))}
              </div>
              <textarea
                id="markdown"
                value={markdown}
                onChange={(event) => setMarkdown(event.target.value)}
                className="h-full w-full resize-none overflow-auto bg-transparent p-3 font-mono text-sm leading-6 text-[#1f1309] outline-none"
                placeholder="# Chapter One&#10;&#10;Begin the tale..."
              />
            </div>

            <div className="mt-3 flex justify-between gap-3 text-sm text-[#5c4328]">
              <span>{t.supports}</span>
              <span>
                {markdown.length.toLocaleString()} {t.chars}
              </span>
            </div>

            <button
              type="submit"
              disabled={!canSubmit || isLoading}
              className="mt-4 flex min-h-14 w-full items-center justify-center gap-3 border border-[#3d0f0b] bg-[#71150f] px-5 text-sm font-bold uppercase tracking-[0.12em] text-[#fff4d6] shadow-[0_6px_0_rgba(61,15,11,0.28)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_0_rgba(61,15,11,0.22)] focus:outline-none focus:ring-2 focus:ring-[#c9973e] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-[#7f6551] disabled:shadow-none"
            >
              {isLoading ? <span className="size-5 animate-spin rounded-full border-2 border-[#fff4d6]/35 border-t-[#fff4d6]" /> : null}
              {isLoading ? t.generating : t.generate}
            </button>

            {markdownFileName ? (
              <p className="mt-3 text-sm text-[#5c4328]">
                {t.uploaded}: {markdownFileName}
              </p>
            ) : null}

            {(isLoading || progressEvents.length > 0) && !result ? (
              <div className="mt-4 border border-[#b69862] bg-[#fff7df]/78 p-4">
                <div className="flex items-center gap-3">
                  <span className="size-9 animate-spin rounded-full border-4 border-[#d7b96b] border-t-[#71150f]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-lg font-bold text-[#71150f]">{t.forgeWorking}</p>
                    <p className="text-sm text-[#5c4328]">{t.forgeWorkingText}</p>
                  </div>
                  <span className="text-sm font-bold text-[#71150f]">{Math.round(progress)}%</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden bg-[#d8bd82]">
                  <div className="h-full bg-[#71150f] transition-all duration-300" style={{ width: `${Math.max(progress, 3)}%` }} />
                </div>
                <div className="mt-4 grid gap-2">
                  {progressEvents.map((event, index) => (
                    <div key={`${event.step}-${index}`} className="flex items-start gap-3 text-sm text-[#5c4328]">
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-[#b7832f]" />
                      <span>
                        {event.message}
                        {event.detail ? <span className="text-[#8a6a3d]"> · {event.detail}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4 border border-[#9d2c22]/45 bg-[#9d2c22]/10 px-4 py-3 text-sm leading-6 text-[#7a170f]">{error}</div>
            ) : null}
          </section>

          <section className="border border-[#b69862] bg-[#fbf1d9]/78 p-5 lg:sticky lg:top-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center border border-[#b69862] bg-[#fff7df] text-lg font-bold text-[#b7832f]">2</span>
                <div>
                  <h2 className="font-serif text-2xl font-bold">{t.previewTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-[#5c4328]">{t.previewText}</p>
                </div>
              </div>
              {result ? (
                <a
                  href={result.pdfUrl}
                  download
                  className="inline-flex min-h-12 items-center justify-center border border-[#3d0f0b] bg-[#71150f] px-5 text-sm font-bold uppercase tracking-[0.1em] text-[#fff4d6] shadow-[0_6px_0_rgba(61,15,11,0.22)] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#c9973e]"
                >
                  {t.download}
                </a>
              ) : null}
            </div>

            <div className="mt-5 h-[760px] overflow-hidden border-[10px] border-[#2a170c] bg-[#e6c991] shadow-[inset_0_0_0_1px_rgba(201,151,62,0.65),0_16px_34px_rgba(43,25,13,0.18)]">
              <div className="h-full overflow-hidden bg-[#2c241b]">
                {isLoading ? (
                  <div className="grid h-full place-items-center bg-[#e6c991] p-8 text-center">
                    <div className="w-full max-w-lg">
                      <div className="mx-auto mb-6 size-20 animate-spin rounded-full border-8 border-double border-[#71150f] border-t-[#d7b96b]" />
                      <p className="font-serif text-3xl font-bold text-[#71150f]">{t.illuminating}</p>
                      <p className="mt-3 text-sm leading-6 text-[#5c4328]">{t.illuminatingText}</p>
                      <div className="mx-auto mt-5 h-2 max-w-sm overflow-hidden bg-[#d8bd82]">
                        <div className="h-full bg-[#71150f] transition-all duration-300" style={{ width: `${Math.max(progress, 3)}%` }} />
                      </div>
                      <div className="mx-auto mt-4 grid max-w-sm gap-2 text-left">
                        {progressEvents.slice(-5).map((event, index) => (
                          <div key={`${event.step}-preview-${index}`} className="flex items-start gap-3 text-sm text-[#5c4328]">
                            <span className="mt-1 size-2 shrink-0 rounded-full bg-[#b7832f]" />
                            <span>
                              {event.message}
                              {event.detail ? <span className="text-[#8a6a3d]"> · {event.detail}</span> : null}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : result ? (
                  <iframe ref={previewIframeRef} title="Manuscript preview" srcDoc={result.previewHtml} className="h-full w-full bg-[#2c241b]" />
                ) : (
                  <div className="grid h-full place-items-center bg-[#e6c991] p-8 text-center">
                    <div className="max-w-md">
                      <p className="font-serif text-3xl font-bold text-[#71150f]">{t.emptyTitle}</p>
                      <p className="mt-3 text-sm leading-6 text-[#5c4328]">{t.emptyText}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {result?.imageFailures ? (
              <p className="mt-3 text-sm text-[#6b160f]">
                {result.imageFailures} {result.imageFailures === 1 ? t.imageFailure : t.imageFailures}
              </p>
            ) : null}
            {imageActionStatus ? <p className="mt-3 text-sm text-[#6b160f]">{imageActionStatus}</p> : null}
          </section>
        </form>
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const selected = event.target.files?.[0];
          const target = uploadTargetRef.current;
          event.target.value = "";
          if (selected && target) void runImageAction("upload", target, selected);
        }}
      />
      <input
        ref={markdownFileInputRef}
        type="file"
        accept=".md,text/markdown,text/plain"
        hidden
        onChange={(event) => {
          void onMarkdownFileChange(event);
        }}
      />

      {illustrationDraft ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#160b05]/70 p-4">
          <div className="w-full max-w-2xl border border-[#c9ae79] bg-[#f4e4bd] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="border-b border-[#c9ae79] pb-4">
              <h2 className="font-serif text-3xl font-bold text-[#71150f]">Regenerate Illustration</h2>
              <p className="mt-1 text-sm leading-6 text-[#5c4328]">
                Edit only the image content. Manuscript style, transparent background, cutout rules, and color handling are added on the backend.
              </p>
            </div>

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="text-sm font-bold text-[#3a2110]">Image Type</span>
                <select
                  value={illustrationDraft.illustrationType}
                  onChange={(event) =>
                    setIllustrationDraft((current) =>
                      current ? { ...current, illustrationType: event.target.value } : current
                    )
                  }
                  className="mt-2 w-full border border-[#b69862] bg-[#fff7df] px-3 py-2 text-sm text-[#251408]"
                >
                  {illustrationTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-[#3a2110]">Content Prompt</span>
                <textarea
                  value={illustrationDraft.prompt}
                  onChange={(event) =>
                    setIllustrationDraft((current) =>
                      current ? { ...current, prompt: event.target.value } : current
                    )
                  }
                  rows={7}
                  maxLength={1200}
                  className="mt-2 w-full resize-y border border-[#b69862] bg-[#fff7df] px-3 py-2 text-sm leading-6 text-[#251408] outline-none focus:ring-2 focus:ring-[#71150f]"
                />
                <span className="mt-1 block text-xs text-[#6a5134]">{illustrationDraft.prompt.length} / 1200</span>
              </label>

            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIllustrationDraft(null)}
                className="min-h-11 border border-[#7a1b12] bg-[#fff7df] px-4 text-sm font-bold text-[#5b170f] transition hover:bg-[#f7e5bd]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const draft = illustrationDraft;
                  setIllustrationDraft(null);
                  void runImageAction("regenerate", draft.sectionId, undefined, {
                    illustrationType: draft.illustrationType,
                    prompt: draft.prompt,
                    caption: draft.caption
                  });
                }}
                className="min-h-11 border border-[#3d0f0b] bg-[#71150f] px-5 text-sm font-bold text-[#fff4d6] transition hover:bg-[#8a1d12]"
              >
                Regenerate Image
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {captionDraft ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#160b05]/70 p-4">
          <div className="w-full max-w-xl border border-[#c9ae79] bg-[#f4e4bd] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="border-b border-[#c9ae79] pb-4">
              <h2 className="font-serif text-3xl font-bold text-[#71150f]">Edit Caption</h2>
              <p className="mt-1 text-sm leading-6 text-[#5c4328]">
                Change only the label shown below this illustration.
              </p>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-bold text-[#3a2110]">Caption</span>
              <input
                value={captionDraft.caption}
                onChange={(event) =>
                  setCaptionDraft((current) => (current ? { ...current, caption: event.target.value } : current))
                }
                maxLength={180}
                className="mt-2 w-full border border-[#b69862] bg-[#fff7df] px-3 py-2 text-sm text-[#251408] outline-none focus:ring-2 focus:ring-[#71150f]"
              />
              <span className="mt-1 block text-xs text-[#6a5134]">{captionDraft.caption.length} / 180</span>
            </label>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCaptionDraft(null)}
                className="min-h-11 border border-[#7a1b12] bg-[#fff7df] px-4 text-sm font-bold text-[#5b170f] transition hover:bg-[#f7e5bd]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const draft = captionDraft;
                  setCaptionDraft(null);
                  void runImageAction("metadata", draft.sectionId, undefined, {
                    illustrationType: draft.illustrationType,
                    prompt: draft.prompt,
                    caption: draft.caption
                  });
                }}
                className="min-h-11 border border-[#3d0f0b] bg-[#71150f] px-5 text-sm font-bold text-[#fff4d6] transition hover:bg-[#8a1d12]"
              >
                Save Caption
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#160b05]/70 p-4">
          <div className="grid h-[92vh] w-full max-w-[1180px] overflow-hidden border border-[#c9ae79] bg-[#f4e4bd] shadow-[0_24px_80px_rgba(0,0,0,0.45)] lg:grid-cols-[minmax(0,1fr)_390px]">
            <div className="min-h-0 overflow-auto p-5 sm:p-6">
              <div className="border-b border-[#c9ae79] pb-4">
                <div>
                  <h2 className="font-serif text-3xl font-bold text-[#71150f]">{t.settingsTitle}</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#5c4328]">{t.settingsText}</p>
                </div>
              </div>

              <section className="py-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#2a170c]">{t.imageCount}</h3>
                    <p className="text-sm leading-5 text-[#6a5134]">{t.imageCountText}</p>
                  </div>
                  <span className="text-sm font-bold text-[#71150f]">{settings.imageLimit}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {imageLimitOptions.map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setSetting("imageLimit", count)}
                      className={`min-h-10 min-w-12 border px-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-[#7a1b12] ${
                        settings.imageLimit === count
                          ? "border-[#7a1b12] bg-[#71150f] text-[#fff4d6]"
                          : "border-[#c9ae79] bg-[#fff7df] text-[#3a2110] hover:border-[#7a1b12]"
                      }`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </section>

              <section className="border-t border-[#d4bd8d] py-4">
                <div className="mb-3">
                  <h3 className="text-base font-bold text-[#2a170c]">{t.chapterStart}</h3>
                  <p className="text-sm leading-5 text-[#6a5134]">{t.chapterStartText}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { value: "auto", label: t.chapterAuto },
                    { value: "newPage", label: t.chapterNewPage },
                    { value: "inline", label: t.chapterInline }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSetting("chapterStart", option.value as ManuscriptSettings["chapterStart"])}
                      className={`min-h-11 border px-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-[#7a1b12] ${
                        settings.chapterStart === option.value
                          ? "border-[#7a1b12] bg-[#71150f] text-[#fff4d6]"
                          : "border-[#c9ae79] bg-[#fff7df] text-[#3a2110] hover:border-[#7a1b12]"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="border-t border-[#d4bd8d] py-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-[#2a170c]">{t.fontStyle}</h3>
                    <p className="text-sm leading-5 text-[#6a5134]">{t.fontStyleText}</p>
                  </div>
                  <span className="text-xs text-[#7d603b]">{selectedFont.label}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {fontOptions.map((font) => (
                    <button
                      key={font.value}
                      type="button"
                      onClick={() => setSetting("fontStyle", font.value)}
                      className={`border bg-[#fff7df] p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#7a1b12] ${
                        settings.fontStyle === font.value
                          ? "border-[#7a1b12] shadow-[inset_0_0_0_2px_rgba(122,27,18,0.28)]"
                          : "border-[#c9ae79] hover:border-[#7a1b12]"
                      }`}
                    >
                      <div className="text-sm font-bold text-[#2a170c]">{font.label}</div>
                      <div className="mt-1 text-xs text-[#725536]">{font.description}</div>
                      <div className="mt-3 min-h-16 text-[#3a160d]" style={{ fontFamily: font.family }}>
                        {font.preview === "ru" ? (
                          <>
                            <div className="text-2xl leading-7">Сильмеринское Зерцало</div>
                            <div className="text-xl leading-7">Древняя рукопись</div>
                          </>
                        ) : (
                          <>
                            <div className="text-2xl leading-7">Manuscript Forge</div>
                            <div className="text-xl leading-7">Ancient vellum hand</div>
                          </>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid gap-5">
                {assetPicker(t.paper, t.paperText, "paper", "papers", "paper")}
                {assetPicker(t.ornament, t.ornamentText, "ornament", "marginOrnaments", "vertical")}
                {assetPicker(t.divider, t.dividerText, "divider", "dividers", "wide")}
                {assetPicker(t.titleDivider, t.titleDividerText, "titleDivider", "dividers", "wide")}
                {assetPicker(t.dropcap, t.dropcapText, "dropcap", "dropcaps", "square")}
              </div>
            </div>

            <aside className="min-h-0 overflow-auto border-t border-[#c9ae79] bg-[#2a170c] p-5 text-[#f8e8c2] lg:border-l lg:border-t-0">
              <div className="lg:sticky lg:top-5">
                <h3 className="font-serif text-2xl font-bold">{t.pagePreview}</h3>
                <p className="mt-1 text-sm leading-6 text-[#e6cc95]">{t.pagePreviewText}</p>

                <div className="mt-5 overflow-hidden border border-[#c9ae79] bg-[#efe0bd] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]">
                  <div
                    className="relative mx-auto aspect-[0.707/1] max-h-[560px] w-full max-w-[330px] overflow-hidden bg-cover bg-center text-[#2a170c]"
                    style={{ backgroundImage: `url(${settings.paper})`, fontFamily: selectedFont.family }}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(255,245,210,0.16),transparent_43%),linear-gradient(90deg,rgba(68,33,13,0.18),transparent_14%,transparent_86%,rgba(68,33,13,0.16))]" />
                    <img
                      src={settings.ornament}
                      alt=""
                      className="absolute left-4 top-12 h-[72%] w-[54px] object-contain object-top opacity-95"
                    />
                    <div className="relative z-10 flex h-full flex-col py-12 pl-24 pr-10" style={{ color: previewInk.ink }}>
                      <h4 className="text-center text-3xl font-bold leading-tight" style={{ color: previewInk.red }}>{t.sampleHeading}</h4>
                      <img src={settings.titleDivider} alt="" className="mx-auto mt-3 h-8 w-44 object-contain" />
                      <div className="mt-6 flex items-start gap-2">
                        <span
                          className="relative grid size-14 shrink-0 place-items-center overflow-hidden text-3xl font-black text-[#fff4d6]"
                          style={{ backgroundColor: dropcapBackground(settings.dropcap) }}
                        >
                          <img src={settings.dropcap} alt="" className="absolute inset-0 size-full object-cover" />
                          <span className="relative z-10">{locale === "ru" ? "Б" : "T"}</span>
                        </span>
                        <p className="text-base leading-7">{t.sampleLine}</p>
                      </div>
                      <img src={settings.divider} alt="" className="mx-auto mt-8 h-10 w-52 object-contain" />
                      <div className="mt-auto border-t border-[#7a5a2e]/35 pt-4 text-center text-xs italic" style={{ color: previewInk.fadedInk }}>
                        {t.sampleCaption}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="mt-5 min-h-12 w-full border border-[#d6a84f] bg-[#71150f] px-5 text-sm font-bold text-[#fff4d6] transition hover:bg-[#8a1d12] focus:outline-none focus:ring-2 focus:ring-[#f8d47a]"
                >
                  {t.applySettings}
                </button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </main>
  );
}
