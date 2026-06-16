import type { BookImage, FontStyle, ManuscriptPlan, ManuscriptSettings } from './types';

/** Asset entry from /assets/manuscript/manifest.json. */
export interface AssetItem {
	id: string;
	output: string;
	width?: number;
	height?: number;
}
export interface AssetManifest {
	groups: Record<string, AssetItem[]>;
}

export const imageLimitOptions = [0, 1, 2, 3, 4, 6, 8];

/* ---------------- page geometry (Model A: preview == PDF) ---------------- */

export type PageSize = 'a4' | 'letter';

/** Physical page pixel sizes at 96dpi (the CSS reference resolution). */
export const PAGE_SIZES: Record<PageSize, { w: number; h: number }> = {
	a4: { w: 794, h: 1123 }, // 210×297mm
	letter: { w: 816, h: 1056 } // 8.5×11in
};

export interface PageGeom {
	pageW: number;
	pageH: number;
	padX: number;
	padTop: number;
	padBot: number;
	ornW: number;
	fontSize: number;
	lineHeight: number;
	contentW: number;
	contentH: number;
}

/**
 * Fixed geometry for a print page size. The body font is a fixed px value so the
 * on-screen preview — which is a single uniform `transform: scale()` of this exact
 * page — breaks identically to the printed sheet (a CSS transform never reflows).
 * This is the guarantee behind "preview == PDF".
 */
export function geomFor(size: PageSize): PageGeom {
	const { w, h } = PAGE_SIZES[size] ?? PAGE_SIZES.a4;
	const padX = 76;
	const padTop = 92;
	const padBot = 80;
	const ornW = 54;
	const fontSize = 16;
	const lineHeight = 1.7;
	return {
		pageW: w,
		pageH: h,
		padX,
		padTop,
		padBot,
		ornW,
		fontSize,
		lineHeight,
		contentW: w - padX * 2 - ornW,
		contentH: h - padTop - padBot
	};
}

export const chapterStartOptions: Array<{ value: ManuscriptSettings['chapterStart']; key: string }> = [
	{ value: 'auto', key: 'chapterAuto' },
	{ value: 'newPage', key: 'chapterNewPage' },
	{ value: 'inline', key: 'chapterInline' }
];

export interface FontOption {
	value: FontStyle;
	label: string;
	description: string;
	family: string;
	preview: 'latin' | 'ru';
	/** Custom font files that may not be present; verified via HEAD before showing. */
	assetPath?: string;
}

export const fontOptions: FontOption[] = [
	{ value: 'petrock', label: 'Kingthings Petrock', description: 'Medieval storybook hand (Latin + Cyrillic)', family: '"Forge Petrock", "Forge EB Garamond", serif', preview: 'ru', assetPath: '/assets/manuscript/fonts/kingthings-petrock-regular.ttf' },
	{ value: 'garamond', label: 'EB Garamond', description: 'Readable literary manuscript', family: '"Forge EB Garamond", Georgia, serif', preview: 'latin' },
	{ value: 'monomakh', label: 'Monomakh Unicode', description: 'Old Slavic display hand', family: '"Forge Monomakh", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'ponomar', label: 'Ponomar Unicode', description: 'Church Slavonic book hand', family: '"Forge Ponomar", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'menaion', label: 'Menaion Unicode', description: 'Liturgical manuscript texture', family: '"Forge Menaion", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'fedorovsk', label: 'Fedorovsk Unicode', description: 'Printed old Cyrillic tone', family: '"Forge Fedorovsk", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'ruslan', label: 'Ruslan Display', description: 'Decorative old-script Cyrillic and Latin', family: '"Forge Ruslan", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'uncial', label: 'Uncial Antiqua', description: 'Latin uncial manuscript hand', family: '"Forge Uncial Antiqua", "Forge EB Garamond", serif', preview: 'latin' },
	{ value: 'almendra', label: 'Almendra Display', description: 'Latin fantasy calligraphic display', family: '"Forge Almendra Display", "Forge EB Garamond", serif', preview: 'latin' },
	{ value: 'festus', label: 'Festus', description: 'Latin medieval display hand', family: '"Forge Festus", "Forge EB Garamond", serif', preview: 'latin', assetPath: '/assets/manuscript/fonts/festus.ttf' },
	{ value: 'calligrapher', label: 'Calligrapher', description: 'Latin calligraphic manuscript hand', family: '"Forge Calligrapher", "Forge EB Garamond", serif', preview: 'latin', assetPath: '/assets/manuscript/fonts/calligrapher-regular.ttf' }
];

export function fontFamilyFor(style: FontStyle): string {
	return fontOptions.find((f) => f.value === style)?.family ?? fontOptions[0].family;
}

/** Human-readable name derived from an asset's output filename. */
export function assetName(item?: AssetItem): string {
	if (!item) return '';
	return (
		item.output
			.split('/')
			.pop()
			?.replace(/\.(png|jpg|jpeg|webp)$/i, '')
			.replace(/^(paper|marginOrnaments|dividers|dropcaps)-\d+-/i, '')
			.replace(/-/g, ' ') ?? item.id
	);
}

/** Backdrop colour behind a transparent illuminated drop-cap frame. */
export function dropcapBackground(dropcapPath: string): string {
	const n = dropcapPath.toLowerCase();
	if (n.includes('aged-ink')) return '#182235';
	if (n.includes('cintric')) return '#102b61';
	if (n.includes('herbal')) return '#183a22';
	if (n.includes('royal2')) return '#0e2e73';
	if (n.includes('royal')) return '#6d120c';
	if (n.includes('slavic')) return '#120f0b';
	if (n.includes('vine')) return '#d5aa46';
	if (n.includes('blue')) return '#123044';
	if (n.includes('dark') || n.includes('woodcut')) return '#1f1712';
	return '#5a150d';
}

/** Ink colour theme that adapts to dark vs light paper. */
export function inkThemeForPaper(paperPath: string): { ink: string; fadedInk: string; red: string } {
	const n = paperPath.toLowerCase();
	if (n.includes('dark') || n.includes('stained-alchemist')) {
		return { ink: '#f5dfaf', fadedInk: '#e0bd7b', red: '#ffd08a' };
	}
	return { ink: '#241105', fadedInk: '#553217', red: '#7a170f' };
}

export const assetSettingKeys = ['paper', 'ornament', 'divider', 'titleDivider', 'dropcap'] as const;

/* ---------------- manuscript rendering ---------------- */

/** A renderable block produced from markdown or an AI plan. */
export type ManuscriptBlock =
	| { t: 'h1'; html: string }
	| { t: 'h2'; html: string }
	| { t: 'p'; html: string; dropCap?: boolean }
	| { t: 'illustration'; url: string; caption: string }
	| { t: 'ornament' };

/**
 * One placement on a paginated page: a reference to a block, optionally with an
 * overriding `html` slice (when a long paragraph is split across pages) and a
 * `drop` flag for whether this slice carries the drop cap.
 */
export interface PageSeg {
	i: number;
	html?: string;
	drop?: boolean;
}

const HTML_ESCAPE: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

/**
 * Render inline markdown to safe HTML: escape first, then apply a small,
 * controlled set of transforms (bold, italic). Output is used via {@html}.
 */
export function renderInline(text: string): string {
	let s = escapeHtml(text);
	s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // **bold**
	s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>'); // __bold__
	s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>'); // *italic*
	s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>'); // _italic_
	return s;
}

/**
 * Split rendered inline HTML into its first visible letter and the rest, so a
 * drop cap shows exactly one letter while preserving leading inline tags.
 * Skips over HTML tags (e.g. an opening `<em>`) and entities so the drop cap is
 * the first real character, not a tag/entity character.
 */
export function dropFirst(html: string): { first: string; rest: string } {
	let i = 0;
	while (i < html.length) {
		const ch = html[i];
		if (ch === '<') {
			const close = html.indexOf('>', i);
			if (close === -1) break;
			i = close + 1;
			continue;
		}
		if (ch === '&') {
			const semi = html.indexOf(';', i);
			if (semi !== -1 && semi - i <= 8) {
				i = semi + 1;
				continue;
			}
		}
		if (/[\p{L}\p{N}]/u.test(ch)) {
			return { first: ch, rest: html.slice(0, i) + html.slice(i + 1) };
		}
		i++;
	}
	return { first: '', rest: html };
}

/** True for a Markdown thematic break line (`---`, `***`, `___`, `- - -`). */
function isThematicBreak(s: string): boolean {
	return /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(s);
}

/**
 * Close any inline tags (`<strong>`/`<em>`) left open in `html`, returning the
 * balanced string plus the stack of tag names that were open (outermost first),
 * so a continuation can re-open them.
 */
export function balanceTags(html: string): { closed: string; openTags: string[] } {
	const stack: string[] = [];
	const re = /<(\/?)(strong|em)\b[^>]*>/gi;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		if (m[1]) stack.pop();
		else stack.push(m[2].toLowerCase());
	}
	let closed = html;
	for (let k = stack.length - 1; k >= 0; k--) closed += `</${stack[k]}>`;
	return { closed, openTags: stack.slice() };
}

/**
 * Split inline HTML into a head that satisfies `fit` and a tail with the rest.
 * Breaks only at whitespace (never inside a tag), closes open tags on the head,
 * and re-opens them on the tail. `fit` receives a tag-balanced candidate and
 * returns whether it still fits. Returns null when not even one word fits.
 */
export function splitInlineToFit(
	html: string,
	fit: (closedHtml: string) => boolean
): [string, string] | null {
	const tokens = html.split(/(\s+)/); // keep whitespace tokens for faithful slicing
	const rawAt = (n: number) => tokens.slice(0, n).join('').replace(/\s+$/, '');
	let lo = 1;
	let hi = tokens.length;
	let fitCount = 0;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const raw = rawAt(mid);
		if (raw && fit(balanceTags(raw).closed)) {
			fitCount = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	if (fitCount === 0) return null;
	const rawHead = rawAt(fitCount);
	const { closed, openTags } = balanceTags(rawHead);
	let tail = tokens.slice(fitCount).join('').replace(/^\s+/, '');
	if (tail) tail = openTags.map((t) => `<${t}>`).join('') + tail;
	return [closed, tail];
}

/* ---------------- shared pagination ---------------- */

export interface PaginateOpts {
	/** How chapter/heading boundaries break across pages. */
	breakMode: 'auto' | 'newPage' | 'inline';
	/** Whether drop caps are enabled (an illuminated initial is configured). */
	dropcap: boolean;
}

export interface PaginateMeasure {
	/** Height (incl. vertical margins) of whole block `i` in the measuring column. */
	blockHeight: (i: number) => number;
	/** Height of a single paragraph slice rendered with/without a drop cap. */
	measureP: (html: string, drop: boolean) => number;
}

/**
 * Greedily pack measured blocks into pages of `contentH`. Long paragraphs are
 * split across pages so no prose is ever clipped; headings start sections per
 * `breakMode`. This is the single paginator shared by the preview/PDF (Model A)
 * and the interactive reader (Model B) — they differ only in the `geom`/`fs` and
 * `breakMode` they pass in, never in the algorithm.
 */
export function paginate(
	blocks: ManuscriptBlock[],
	contentH: number,
	fs: number,
	opts: PaginateOpts,
	measure: PaginateMeasure
): PageSeg[][] {
	const result: PageSeg[][] = [];
	let cur: PageSeg[] = [];
	let h = 0;
	let pageHasProse = false; // whether body text has appeared since the last page break
	const flushPage = () => {
		if (cur.length) {
			result.push(cur);
			cur = [];
			h = 0;
			pageHasProse = false;
		}
	};
	// A block begins a new section when it's a heading, or an ornament that
	// immediately precedes one (the section's leading divider).
	const startsSection = (idx: number): boolean => {
		const b = blocks[idx];
		if (b.t === 'h1' || b.t === 'h2') return true;
		if (b.t === 'ornament') {
			const n = blocks[idx + 1];
			return !!n && (n.t === 'h1' || n.t === 'h2');
		}
		return false;
	};

	blocks.forEach((b, i) => {
		const bh = measure.blockHeight(i);
		// Chapter-start behaviour. Only act once prose has appeared on the page,
		// so stacked front-matter headings (title/subtitle) stay together.
		if (cur.length && pageHasProse && startsSection(i)) {
			if (opts.breakMode === 'newPage') {
				flushPage();
			} else if (opts.breakMode === 'auto') {
				// Avoid an orphaned heading at the page foot: need room for it + ~2 lines.
				if (h + bh + Math.round(1.7 * fs * 2) > contentH) flushPage();
			}
		}
		if (h + bh <= contentH) {
			cur.push({ i });
			h += bh;
			if (b.t === 'p' || b.t === 'illustration') pageHasProse = true;
			return;
		}
		// Doesn't fit in the remaining space.
		if (b.t !== 'p') {
			flushPage();
			cur.push({ i });
			h = bh;
			if (h > contentH) flushPage(); // oversized atomic block (rare); give it its own page
			return;
		}
		// Split the paragraph so part fills this page and the rest flows on.
		let html = b.html;
		let drop = !!b.dropCap && opts.dropcap;
		const minLine = Math.round(1.7 * fs);
		let guard = 0;
		while (html && guard++ < 4000) {
			const avail = contentH - h;
			if (avail < minLine && cur.length) {
				flushPage();
				continue;
			}
			const whole = balanceTags(html).closed;
			if (measure.measureP(whole, drop) <= avail) {
				cur.push({ i, html: whole, drop });
				h += measure.measureP(whole, drop);
				html = '';
				break;
			}
			const res = splitInlineToFit(html, (c) => measure.measureP(c, drop) <= avail);
			if (!res) {
				if (cur.length) {
					flushPage();
					continue;
				}
				// Empty page yet nothing fits — force the slice to avoid an infinite loop.
				cur.push({ i, html: whole, drop });
				flushPage();
				html = '';
				break;
			}
			cur.push({ i, html: res[0], drop });
			flushPage();
			html = res[1];
			drop = false;
		}
		pageHasProse = true; // a (possibly split) paragraph landed on the current page
	});
	flushPage();
	return result.length ? result : [[]];
}

/**
 * Build renderable blocks from an AI plan (preferred) or raw markdown.
 * When a plan is present, headings/drop caps/ornaments/illustrations come from
 * the plan; otherwise we fall back to a simple markdown parse.
 */
export function buildBlocks(
	md: string,
	plan?: ManuscriptPlan | null,
	images?: BookImage[]
): ManuscriptBlock[] {
	if (plan && plan.sections?.length) {
		return blocksFromPlan(plan, images);
	}
	return blocksFromMarkdown(md);
}

function blocksFromPlan(plan: ManuscriptPlan, images?: BookImage[]): ManuscriptBlock[] {
	const imageBy = new Map((images ?? []).filter((i) => !i.failed && i.url).map((i) => [i.sectionId, i]));
	const blocks: ManuscriptBlock[] = [];
	if (plan.title) blocks.push({ t: 'h1', html: renderInline(plan.title) });
	if (plan.subtitle) blocks.push({ t: 'h2', html: renderInline(plan.subtitle) });

	for (const sec of plan.sections) {
		const heading = (sec.displayHeading || '').trim();
		// A heading already renders its own divider, so only emit a standalone
		// ornament divider when there is no heading (avoids a doubled rule).
		if (sec.ornament && !heading) blocks.push({ t: 'ornament' });
		if (heading) {
			blocks.push({ t: sec.level <= 1 ? 'h1' : 'h2', html: renderInline(heading) });
		}
		const img = sec.illustration ? imageBy.get(sec.id) : undefined;
		if (img && sec.illustration?.placement === 'before') {
			blocks.push({ t: 'illustration', url: img.url, caption: img.caption });
		}
		// The body may itself contain Markdown heading lines (e.g. a section that
		// opens with "### ..."). Render those as headings rather than leaking the
		// "###" markers into prose (and stealing the first letter for a drop cap).
		let droppedCap = false;
		for (const block of bodyBlocks(sec.bodyMarkdown)) {
			if (block.t === 'p') {
				const dropCap = !!sec.dropCap && !droppedCap;
				if (dropCap) droppedCap = true;
				blocks.push({ t: 'p', html: block.html, dropCap });
			} else {
				blocks.push(block);
			}
		}
		if (img && sec.illustration?.placement !== 'before') {
			blocks.push({ t: 'illustration', url: img.url, caption: img.caption });
		}
	}
	return blocks;
}

function blocksFromMarkdown(src: string): ManuscriptBlock[] {
	const blocks: ManuscriptBlock[] = [];
	let para: string[] = [];
	const flush = () => {
		if (para.length) {
			blocks.push({ t: 'p', html: renderInline(para.join(' ')) });
			para = [];
		}
	};
	for (const l of (src || '').split('\n')) {
		const heading = /^(#{1,6})\s+(.*)$/.exec(l);
		if (heading) {
			// Only a top-level `#` is the manuscript title (h1); every deeper level
			// (##..######) is a section heading (h2) — otherwise the `###` markers
			// leak into the prose and the drop cap steals the first letter.
			flush();
			blocks.push({ t: heading[1].length <= 1 ? 'h1' : 'h2', html: renderInline(heading[2].trim()) });
		} else if (isThematicBreak(l)) {
			flush();
		} else if (l.trim() === '') {
			flush();
		} else {
			para.push(l);
		}
	}
	flush();
	// Mark the first paragraph as drop-cap eligible (matches legacy behaviour).
	const firstP = blocks.find((b) => b.t === 'p') as Extract<ManuscriptBlock, { t: 'p' }> | undefined;
	if (firstP) firstP.dropCap = true;
	return blocks;
}

/**
 * Parse a section body into heading/paragraph blocks. Heading lines (`#`..`######`)
 * become h1/h2 blocks (matching the plan's two-level heading styling); thematic
 * breaks separate paragraphs; everything else is blank-line-separated prose.
 */
function bodyBlocks(body: string): ManuscriptBlock[] {
	const out: ManuscriptBlock[] = [];
	let para: string[] = [];
	const flush = () => {
		if (para.length) {
			out.push({ t: 'p', html: renderInline(para.join(' ')) });
			para = [];
		}
	};
	for (const line of (body || '').split('\n')) {
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			flush();
			out.push({ t: heading[1].length <= 1 ? 'h1' : 'h2', html: renderInline(heading[2].trim()) });
		} else if (isThematicBreak(line) || line.trim() === '') {
			flush();
		} else {
			para.push(line.trim());
		}
	}
	flush();
	return out;
}

/** Loads the asset manifest from /static. */
export async function loadManifest(): Promise<AssetManifest | null> {
	try {
		const res = await fetch('/assets/manuscript/manifest.json');
		if (!res.ok) return null;
		return (await res.json()) as AssetManifest;
	} catch {
		return null;
	}
}
