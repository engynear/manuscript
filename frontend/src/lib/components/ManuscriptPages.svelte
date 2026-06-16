<script lang="ts">
	import type { ManuscriptSettings } from '$lib/types';
	import { fontFamilyFor, dropcapBackground, inkThemeForPaper } from '$lib/manuscript';

	interface Props {
		md: string;
		settings: ManuscriptSettings;
		width?: number;
	}
	let { md, settings: s, width = 500 }: Props = $props();

	type Block = { t: 'h1' | 'h2' | 'p' | 'hr'; text: string };

	const family = $derived(fontFamilyFor(s.fontStyle));
	const ink = $derived(inkThemeForPaper(s.paper));

	// A4 proportion: height = width * √2.
	const pageW = $derived(width);
	const pageH = $derived(Math.round(width * 1.41421));
	const padX = 46;
	const padTop = 52;
	const padBot = 46;
	const ornW = 46;
	const contentH = $derived(pageH - padTop - padBot);

	function parse(src: string): Block[] {
		const blocks: Block[] = [];
		let para: string[] = [];
		const flush = () => {
			if (para.length) {
				blocks.push({ t: 'p', text: para.join(' ') });
				para = [];
			}
		};
		for (const l of (src || '').split('\n')) {
			const trimmed = l.trim();
			if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
				flush();
				blocks.push({ t: 'hr', text: '' });
			} else if (l.startsWith('## ')) {
				flush();
				blocks.push({ t: 'h2', text: l.slice(3) });
			} else if (l.startsWith('# ')) {
				flush();
				blocks.push({ t: 'h1', text: l.slice(2) });
			} else if (trimmed === '') {
				flush();
			} else {
				para.push(l);
			}
		}
		flush();
		return blocks;
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	function inlineMarkdown(value: string): string {
		return escapeHtml(value)
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/\*([^*]+)\*/g, '<em>$1</em>');
	}

	const blocks = $derived(parse(md));
	const firstParaIdx = $derived(blocks.findIndex((b) => b.t === 'p'));

	// Pagination: measure each block, greedily pack into A4-height pages.
	let measureEl: HTMLDivElement | undefined = $state();
	let pages = $state<number[][]>([]); // arrays of block indices

	function paginate() {
		if (!measureEl) return;
		const kids = Array.from(measureEl.children) as HTMLElement[];
		const result: number[][] = [];
		let cur: number[] = [];
		let h = 0;
		kids.forEach((el, i) => {
			const cs = getComputedStyle(el);
			const bh = el.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
			if (h + bh > contentH && cur.length) {
				result.push(cur);
				cur = [];
				h = 0;
			}
			cur.push(i);
			h += bh;
		});
		if (cur.length) result.push(cur);
		pages = result.length ? result : [[]];
	}

	$effect(() => {
		// Re-paginate when content, settings, or width change — after fonts load.
		void [md, s, width];
		let cancelled = false;
		const run = () => !cancelled && requestAnimationFrame(paginate);
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

{#snippet blockView(b: Block, isFirstPara: boolean)}
	{#if b.t === 'h1'}
		<h1 style="text-align:center;margin:0 0 .2em;font-size:2em;font-weight:700;color:{ink.red}">
			{b.text}
		</h1>
		{#if s.titleDivider}
			<img src={s.titleDivider} alt="" style="display:block;margin:.2em auto 1em;height:28px;width:60%;object-fit:contain" />
		{/if}
	{:else if b.t === 'h2'}
		{#if s.divider}
			<img src={s.divider} alt="" style="display:block;margin:1em auto .8em;height:32px;width:55%;object-fit:contain" />
		{/if}
		<h2 style="text-align:center;margin:0 0 .6em;font-size:1.35em;font-weight:600;color:{ink.red};letter-spacing:.01em">
			{b.text}
		</h2>
	{:else if b.t === 'hr'}
		{#if s.divider}
			<img src={s.divider} alt="" style="display:block;margin:1em auto;height:28px;width:50%;object-fit:contain" />
		{:else}
			<hr style="border:none;border-top:1px solid color-mix(in srgb,{ink.red} 42%,transparent);margin:1.2em auto;width:54%" />
		{/if}
	{:else if isFirstPara && s.dropcap}
		<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">
			<span
				style="position:relative;float:left;display:grid;place-items:center;overflow:hidden;width:60px;height:60px;margin:.05em .35em 0 0;background-color:{dropcapBackground(
					s.dropcap
				)};color:#fff4d6;font-weight:700;font-size:40px;line-height:1"
			>
				<img src={s.dropcap} alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
				<span style="position:relative;z-index:1">{b.text.charAt(0)}</span>
			</span>{@html inlineMarkdown(b.text.slice(1))}
		</p>
	{:else}
		<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">{@html inlineMarkdown(b.text)}</p>
	{/if}
{/snippet}

<!-- hidden measuring column at the page's content width -->
<div
	bind:this={measureEl}
	aria-hidden="true"
	style="position:absolute;left:-99999px;top:0;visibility:hidden;width:{pageW -
		padX -
		ornW}px;font-family:{family};font-size:17px;line-height:1.7;color:{ink.ink}"
>
	{#each blocks as b, i}
		<div>{@render blockView(b, i === firstParaIdx)}</div>
	{/each}
</div>

<!-- visible A4 pages -->
<div style="display:flex;flex-direction:column;align-items:center;gap:20px">
	{#each pages as pageIdx}
		<div
			style="position:relative;overflow:hidden;flex:0 0 auto;width:{pageW}px;height:{pageH}px;
				background-image:url({s.paper});background-size:100% auto;background-position:top center;background-repeat:repeat-y;
				font-family:{family};color:{ink.ink};font-size:17px;line-height:1.7;
				box-shadow:var(--shadow-lg);border-radius:3px"
		>
			<div
				style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 30%,rgba(255,245,210,.14),transparent 45%),linear-gradient(90deg,rgba(68,33,13,.16),transparent 14%,transparent 86%,rgba(68,33,13,.14))"
			></div>
			{#if s.ornament}
				<img
					src={s.ornament}
					alt=""
					style="position:absolute;left:18px;top:{padTop}px;height:{contentH}px;width:{ornW -
						14}px;object-fit:contain;object-position:top;opacity:.95"
				/>
			{/if}
			<div
				style="position:relative;z-index:1;height:100%;overflow:hidden;padding:{padTop}px {padX}px {padBot}px {padX +
					ornW}px"
			>
				{#each pageIdx as bi}
					{@render blockView(blocks[bi], bi === firstParaIdx)}
				{/each}
			</div>
		</div>
	{/each}
</div>
