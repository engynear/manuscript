<script lang="ts">
	import type { BookImage, ManuscriptPlan, ManuscriptSettings } from '$lib/types';
	import {
		fontFamilyFor,
		dropcapBackground,
		inkThemeForPaper,
		buildBlocks,
		dropFirst,
		geomFor,
		paginate
	} from '$lib/manuscript';
	import type { ManuscriptBlock, PageSeg } from '$lib/manuscript';
	import { mediaUrl } from '$lib/api';

	interface Props {
		md: string;
		settings: ManuscriptSettings;
		/** Target display width in px. The fixed page is scaled to fit it. */
		width?: number;
		plan?: ManuscriptPlan | null;
		images?: BookImage[];
		/** Print mode: render every page at 1:1 with page breaks, no chrome/scale. */
		print?: boolean;
	}
	let { md, settings: s, width, plan = null, images = [], print = false }: Props = $props();

	const family = $derived(fontFamilyFor(s.fontStyle));
	const ink = $derived(inkThemeForPaper(s.paper));

	// Model A geometry: a fixed physical page. The preview is a uniform CSS
	// transform of this exact page, so its breaks match the printed PDF.
	const geom = $derived(geomFor(s.pageSize ?? 'a4'));
	const scale = $derived(print ? 1 : (width ?? geom.pageW) / geom.pageW);

	const blocks = $derived(buildBlocks(md, plan, images));

	let measureEl: HTMLDivElement | undefined = $state();
	let splitEl: HTMLDivElement | undefined = $state();
	let pages = $state<PageSeg[][]>([]);

	/** Markup for a paragraph slice, matching the rendered <p> so heights agree. */
	function pHtml(html: string, drop: boolean): string {
		if (drop) {
			const { rest } = dropFirst(html);
			return `<p style="margin:0 0 .85em;text-align:justify;hyphens:auto"><span style="float:left;width:60px;height:60px;margin:.05em .35em 0 0;font-size:40px;line-height:1"></span>${rest}</p>`;
		}
		return `<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">${html}</p>`;
	}

	function runPaginate() {
		if (!measureEl || !splitEl) return;
		const kids = Array.from(measureEl.children) as HTMLElement[];
		pages = paginate(
			blocks,
			geom.contentH,
			geom.fontSize,
			{ breakMode: s.chapterStart, dropcap: !!s.dropcap },
			{
				blockHeight: (i) => {
					const el = kids[i];
					const cs = getComputedStyle(el);
					return el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
				},
				measureP: (html, drop) => {
					splitEl!.innerHTML = pHtml(html, drop);
					return (splitEl!.firstElementChild as HTMLElement).offsetHeight;
				}
			}
		);
	}

	$effect(() => {
		void [md, s, geom, plan, images];
		let cancelled = false;
		const run = () => !cancelled && requestAnimationFrame(runPaginate);
		if (typeof document !== 'undefined' && document.fonts?.ready) {
			document.fonts.ready.then(run);
		} else {
			run();
		}
		return () => {
			cancelled = true;
		};
	});
</script>

{#snippet blockView(b: ManuscriptBlock)}
	{#if b.t === 'h1'}
		<h1 style="text-align:center;margin:0 0 .2em;font-size:2em;font-weight:700;color:{ink.red}">
			{@html b.html}
		</h1>
		{#if s.titleDivider}
			<img src={s.titleDivider} alt="" style="display:block;margin:.2em auto 1em;height:28px;width:60%;object-fit:contain" />
		{/if}
	{:else if b.t === 'h2'}
		{#if s.divider}
			<img src={s.divider} alt="" style="display:block;margin:1em auto .8em;height:32px;width:55%;object-fit:contain" />
		{/if}
		<h2 style="text-align:center;margin:0 0 .6em;font-size:1.35em;font-weight:600;color:{ink.red};letter-spacing:.01em">
			{@html b.html}
		</h2>
	{:else if b.t === 'ornament'}
		{#if s.divider}
			<img src={s.divider} alt="" style="display:block;margin:1em auto;height:28px;width:48%;object-fit:contain;opacity:.9" />
		{/if}
	{:else if b.t === 'illustration'}
		<figure style="margin:1em 0;text-align:center">
			<img src={mediaUrl(b.url)} alt={b.caption} style="display:block;margin:0 auto;max-width:78%;max-height:{Math.round(geom.contentH * 0.5)}px;object-fit:contain" />
			{#if b.caption}
				<figcaption style="margin-top:.4em;font-style:italic;font-size:.85em;color:{ink.fadedInk}">{b.caption}</figcaption>
			{/if}
		</figure>
	{:else if b.t === 'verse'}
		<p style="margin:.4em 0 .9em;text-align:center;font-style:italic;line-height:1.55;color:{ink.fadedInk}">{@html b.html}</p>
	{:else if b.dropCap && s.dropcap}
		<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">
			<span
				style="position:relative;float:left;display:grid;place-items:center;overflow:hidden;width:60px;height:60px;margin:.05em .35em 0 0;background-color:{dropcapBackground(
					s.dropcap
				)};color:#fff4d6;font-weight:700;font-size:40px;line-height:1"
			>
				<img src={s.dropcap} alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
				<span style="position:relative;z-index:1">{@html dropFirst(b.html).first}</span>
			</span>{@html dropFirst(b.html).rest}
		</p>
	{:else}
		<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">{@html b.html}</p>
	{/if}
{/snippet}

<!-- a placement on a page: a whole block, or an overriding (possibly split) paragraph slice -->
{#snippet segView(seg: PageSeg)}
	{#if seg.html === undefined}
		{@render blockView(blocks[seg.i])}
	{:else if seg.drop && s.dropcap}
		<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">
			<span
				style="position:relative;float:left;display:grid;place-items:center;overflow:hidden;width:60px;height:60px;margin:.05em .35em 0 0;background-color:{dropcapBackground(
					s.dropcap
				)};color:#fff4d6;font-weight:700;font-size:40px;line-height:1"
			>
				<img src={s.dropcap} alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
				<span style="position:relative;z-index:1">{@html dropFirst(seg.html).first}</span>
			</span>{@html dropFirst(seg.html).rest}
		</p>
	{:else}
		<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">{@html seg.html}</p>
	{/if}
{/snippet}

<!-- hidden measuring column at the page's content width (fixed geometry) -->
<div
	bind:this={measureEl}
	aria-hidden="true"
	style="position:absolute;left:-99999px;top:0;visibility:hidden;width:{geom.contentW}px;font-family:{family};font-size:{geom.fontSize}px;line-height:{geom.lineHeight};color:{ink.ink}"
>
	{#each blocks as b}
		<div style="display:flow-root">{@render blockView(b)}</div>
	{/each}
</div>

<!-- single-paragraph measurer for splitting long paragraphs across pages -->
<div
	bind:this={splitEl}
	aria-hidden="true"
	style="position:absolute;left:-99999px;top:0;visibility:hidden;display:flow-root;width:{geom.contentW}px;font-family:{family};font-size:{geom.fontSize}px;line-height:{geom.lineHeight};color:{ink.ink}"
></div>

<!-- visible pages -->
<div class="ms-pages" class:print style="display:flex;flex-direction:column;align-items:center;gap:{print ? 0 : 20}px">
	{#each pages as pageSegs}
		<div
			class="ms-page-box"
			style="position:relative;flex:0 0 auto;width:{Math.round(geom.pageW * scale)}px;height:{Math.round(geom.pageH * scale)}px"
		>
			<div
				class="ms-page"
				style="position:absolute;top:0;left:0;transform:scale({scale});transform-origin:top left;
					overflow:hidden;width:{geom.pageW}px;height:{geom.pageH}px;
					background-image:url({s.paper});background-size:cover;background-position:center;
					font-family:{family};color:{ink.ink};font-size:{geom.fontSize}px;line-height:{geom.lineHeight};
					{print ? '' : 'box-shadow:var(--shadow-lg);border-radius:3px'}"
			>
				<div
					style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 30%,rgba(255,245,210,.14),transparent 45%),linear-gradient(90deg,rgba(68,33,13,.16),transparent 14%,transparent 86%,rgba(68,33,13,.14))"
				></div>
				{#if s.ornament}
					<img
						src={s.ornament}
						alt=""
						style="position:absolute;left:18px;top:{geom.padTop}px;height:{geom.contentH}px;width:{geom.ornW -
							14}px;object-fit:contain;object-position:top;opacity:.95"
					/>
				{/if}
				<div
					style="position:relative;z-index:1;height:100%;overflow:hidden;padding:{geom.padTop}px {geom.padX}px {geom.padBot}px {geom.padX +
						geom.ornW}px"
				>
					{#each pageSegs as seg}
						{@render segView(seg)}
					{/each}
				</div>
			</div>
		</div>
	{/each}
</div>

<style>
	@media print {
		.ms-pages.print .ms-page-box {
			break-after: page;
			page-break-after: always;
		}
		.ms-pages.print .ms-page-box:last-child {
			break-after: auto;
			page-break-after: auto;
		}
		.ms-pages.print .ms-page {
			box-shadow: none !important;
			border-radius: 0 !important;
		}
	}
</style>
