<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { ManuscriptSettings } from '$lib/types';
	import { fontFamilyFor, dropcapBackground, inkThemeForPaper } from '$lib/manuscript';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		md: string;
		settings: ManuscriptSettings;
		/** 'spread' = facing two-page book, 'single' = one page at a time. */
		mode?: 'spread' | 'single';
	}
	let { md, settings: s, mode = 'spread' }: Props = $props();

	type Block = { t: 'h1' | 'h2' | 'p' | 'hr'; text: string };

	const single = $derived(mode === 'single');
	const per = $derived(single ? 1 : 2); // pages advanced per turn

	const family = $derived(fontFamilyFor(s.fontStyle));
	const ink = $derived(inkThemeForPaper(s.paper));

	// ---- responsive sizing: fit the page(s) (H = W·√2) into the viewport ----
	let vw = $state(1280);
	let vh = $state(800);
	const A4 = 1.41421;
	const pageH = $derived(
		single
			? Math.max(360, Math.min(880, Math.min(vh - 150, (vw - 96) * A4)))
			: Math.max(360, Math.min(760, Math.min(vh - 150, (vw - 96) / A4)))
	);
	const pageW = $derived(Math.round(pageH / A4));

	const padX = $derived(Math.round(pageW * 0.11));
	const padTop = $derived(Math.round(pageH * 0.085));
	const padBot = $derived(Math.round(pageH * 0.07));
	const ornW = $derived(Math.round(pageW * 0.115));
	const fs = $derived(Math.max(14, Math.round(pageW * 0.044)));
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

	function dropcapText(value: string): { letter: string; rest: string } {
		const clean = value.replace(/[*_`]+/g, '').trimStart();
		return { letter: clean.charAt(0), rest: clean.slice(1) };
	}

	const blocks = $derived(parse(md));
	const firstParaIdx = $derived(blocks.findIndex((b) => b.t === 'p'));

	// ---- pagination: measure each block, greedily pack into A4-height pages ----
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
		const next = result.length ? result : [[]];
		pages = next;
		if (spread > next.length - 1) {
			const last = Math.max(0, next.length - 1);
			spread = single ? last : last & ~1;
		}
	}

	$effect(() => {
		void [md, s, pageW, contentH];
		let cancelled = false;
		// rAF flushes layout before measuring; the timeout is a fallback for
		// hidden/throttled tabs where rAF may not fire.
		const run = () => {
			if (cancelled) return;
			requestAnimationFrame(paginate);
			setTimeout(paginate, 60);
		};
		if (typeof document !== 'undefined' && document.fonts?.ready) {
			document.fonts.ready.then(run);
		} else {
			run();
		}
		return () => {
			cancelled = true;
		};
	});

	// ---- spread + page-turn state ----
	let spread = $state(0); // index of the left/only page (even in spread mode)
	let turning = $state<{ dir: 'next' | 'prev' } | null>(null);
	let leafEl = $state<HTMLDivElement>();

	const total = $derived(pages.length);
	const canNext = $derived(!turning && spread + per < total);
	const canPrev = $derived(!turning && spread - per >= 0);

	// Underneath the flipping leaf we already paint the destination page(s) so
	// they are revealed seamlessly as the leaf lifts.
	const leftIdx = $derived(turning?.dir === 'prev' ? spread - 2 : spread);
	const rightIdx = $derived(turning?.dir === 'next' ? spread + 3 : spread + 1);
	const leafFront = $derived(turning?.dir === 'next' ? spread + 1 : spread);
	const leafBack = $derived(turning?.dir === 'next' ? spread + 2 : spread - 1);
	// Single mode: the static layer shows the destination page; the leaf is the
	// current page peeling away to reveal it (its back is blank paper, idx -1).
	const centerIdx = $derived(turning ? (turning.dir === 'next' ? spread + 1 : spread - 1) : spread);
	const leafFrontIdx = $derived(single ? spread : leafFront);
	const leafBackIdx = $derived(single ? -1 : leafBack);

	const lastPage = $derived(Math.min(spread + per, total));

	// Keep the index aligned when the layout mode changes.
	$effect(() => {
		if (mode === 'spread' && spread % 2 === 1) spread = spread - 1;
	});

	async function turn(dir: 'next' | 'prev') {
		if (turning) return;
		if (dir === 'next' && spread + per >= total) return;
		if (dir === 'prev' && spread - per < 0) return;
		turning = { dir };
		await tick();
		const el = leafEl;
		const reduce =
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		if (el) {
			const dur = reduce ? 1 : 760;
			const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
			const to = dir === 'next' ? -180 : 180;
			const anim = el.animate(
				[{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${to}deg)` }],
				{ duration: dur, easing, fill: 'forwards' }
			);
			// Hard-swap the two faces at the point where the leaf passes 90°, so the
			// flip is correct even where `backface-visibility` is unreliable (Firefox
			// drops it when an element also clips its overflow). With this easing the
			// rotation crosses 90° at ~13% of the timeline.
			const cross = 0.13;
			const front = el.querySelector('.bs-front');
			const back = el.querySelector('.bs-back');
			const stepOpts: KeyframeAnimationOptions = { duration: dur, fill: 'forwards' };
			front?.animate(
				[{ opacity: 1, offset: 0 }, { opacity: 1, offset: cross }, { opacity: 0, offset: cross }, { opacity: 0, offset: 1 }],
				stepOpts
			);
			back?.animate(
				[{ opacity: 0, offset: 0 }, { opacity: 0, offset: cross }, { opacity: 1, offset: cross }, { opacity: 1, offset: 1 }],
				stepOpts
			);
			// Commit on whichever resolves first: the animation finishing, or a
			// timer. The timer guarantees we never get stuck if the tab is
			// backgrounded (WAAPI pauses, but timers still fire).
			await new Promise<void>((resolve) => {
				let settled = false;
				const finish = () => {
					if (settled) return;
					settled = true;
					resolve();
				};
				anim.finished.then(finish).catch(finish);
				setTimeout(finish, dur + 120);
			});
		}
		spread = dir === 'next' ? spread + per : spread - per;
		turning = null;
	}

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLElement && /input|textarea/i.test(e.target.tagName)) return;
		if (e.key === 'ArrowRight' || e.key === 'PageDown') {
			e.preventDefault();
			turn('next');
		} else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
			e.preventDefault();
			turn('prev');
		}
	}

	onMount(() => {
		const sync = () => {
			vw = window.innerWidth;
			vh = window.innerHeight;
		};
		sync();
		window.addEventListener('resize', sync);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('resize', sync);
			window.removeEventListener('keydown', onKey);
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
		{@const dc = dropcapText(b.text)}
		<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">
			<span
				style="position:relative;float:left;display:grid;place-items:center;overflow:hidden;width:60px;height:60px;margin:.05em .35em 0 0;background-color:{dropcapBackground(
					s.dropcap
				)};color:#fff4d6;font-weight:700;font-size:40px;line-height:1"
			>
				<img src={s.dropcap} alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
				<span style="position:relative;z-index:1">{dc.letter}</span>
			</span>{dc.rest}
		</p>
	{:else}
		<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">{@html inlineMarkdown(b.text)}</p>
	{/if}
{/snippet}

<!-- one page face: paper, gutter shading, ornament, content. side decides the spine edge. -->
{#snippet face(idx: number, side: 'left' | 'right' | 'single')}
	<div
		style="position:absolute;inset:0;overflow:hidden;
			background-image:url({s.paper});background-size:100% 100%;background-position:center;
			font-family:{family};color:{ink.ink};font-size:{fs}px;line-height:1.7"
	>
		<!-- ambient page sheen -->
		<div
			style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 28%,rgba(255,245,210,.12),transparent 46%)"
		></div>
		<!-- gutter shadow: darker toward the spine (only when facing a sibling page) -->
		{#if side !== 'single'}
			<div
				style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(
					{side === 'left' ? '90deg' : '270deg'},
					transparent 78%,
					rgba(48,24,9,.06) 90%,
					rgba(48,24,9,.20) 100%)"
			></div>
		{/if}
		{#if pages[idx]}
			{#if s.ornament}
				<img
					src={s.ornament}
					alt=""
					style="position:absolute;{side === 'right'
						? `right:${Math.round(padX * 0.3)}px`
						: `left:${Math.round(padX * 0.3)}px`};top:{padTop}px;height:{contentH}px;width:{ornW}px;object-fit:contain;object-position:top;opacity:.95"
				/>
			{/if}
			<div
				style="position:relative;z-index:1;height:100%;overflow:hidden;padding:{padTop}px {side === 'right'
					? padX + ornW
					: padX}px {padBot}px {side === 'right' ? padX : padX + ornW}px"
			>
				{#each pages[idx] as bi}
					{@render blockView(blocks[bi], bi === firstParaIdx)}
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

<div class="bs-stage" style="--pw:{pageW}px;--ph:{pageH}px">
	<!-- hidden measuring column at one page's content width -->
	<div
		bind:this={measureEl}
		aria-hidden="true"
		style="position:absolute;left:-99999px;top:0;visibility:hidden;width:{pageW -
			padX * 2 -
			ornW}px;font-family:{family};font-size:{fs}px;line-height:1.7;color:{ink.ink}"
	>
		{#each blocks as b, i}
			<div>{@render blockView(b, i === firstParaIdx)}</div>
		{/each}
	</div>

	<div
		class="bs-book"
		style="width:{single ? pageW : pageW * 2}px;height:{pageH}px"
		role="group"
		aria-label="Page {spread + 1}{single ? '' : ` to ${lastPage}`} of {total}"
	>
		{#if single}
			<!-- single centered page -->
			<div class="bs-page" style="left:0;width:{pageW}px;height:{pageH}px;border-radius:4px">
				{@render face(centerIdx, 'single')}
			</div>
		{:else}
			<!-- spine -->
			<div class="bs-spine"></div>
			<!-- left page -->
			<div class="bs-page" style="left:0;width:{pageW}px;height:{pageH}px;border-radius:4px 0 0 4px">
				{@render face(leftIdx, 'left')}
			</div>
			<!-- right page -->
			<div class="bs-page" style="left:{pageW}px;width:{pageW}px;height:{pageH}px;border-radius:0 4px 4px 0">
				{@render face(rightIdx, 'right')}
			</div>
		{/if}

		<!-- flipping leaf -->
		{#if turning}
			<div
				bind:this={leafEl}
				class="bs-leaf"
				style="width:{pageW}px;height:{pageH}px;
					left:{!single && turning.dir === 'next' ? pageW : 0}px;
					transform-origin:{turning.dir === 'next' ? 'left center' : 'right center'}"
			>
				<div class="bs-face bs-front">
					{@render face(
						leafFrontIdx,
						single ? 'single' : turning.dir === 'next' ? 'right' : 'left'
					)}
					<div class="bs-curl bs-curl-front" style="--edge:{turning.dir === 'next' ? 'left' : 'right'}"></div>
				</div>
				<div class="bs-face bs-back">
					{@render face(leafBackIdx, single ? 'single' : turning.dir === 'next' ? 'left' : 'right')}
					<div class="bs-curl bs-curl-back"></div>
				</div>
			</div>
		{/if}

		<!-- click zones / nav affordances over the outer edges -->
		<button
			class="bs-zone bs-zone-prev"
			disabled={!canPrev}
			aria-label="Previous page"
			onclick={() => turn('prev')}
		>
			<span class="bs-chev"><Icon name="chevL" size={22} /></span>
		</button>
		<button
			class="bs-zone bs-zone-next"
			disabled={!canNext}
			aria-label="Next page"
			onclick={() => turn('next')}
		>
			<span class="bs-chev"><Icon name="chevR" size={22} /></span>
		</button>
	</div>

	<!-- footer: progress + indicator -->
	<div class="bs-footer">
		<button class="bs-fbtn" disabled={!canPrev} onclick={() => turn('prev')} aria-label="Previous page">
			<Icon name="chevL" size={15} />
		</button>
		<div class="bs-meter" aria-hidden="true">
			<span class="bs-fill" style="transform:scaleX({total > 1 ? lastPage / total : 1})"></span>
		</div>
		<div class="bs-count" aria-live="polite">
			{#if single || total <= 1 || lastPage === spread + 1}p. {spread + 1}{:else}pp. {spread +
					1}–{lastPage}{/if}
			<span class="bs-of">of {total}</span>
		</div>
		<button class="bs-fbtn" disabled={!canNext} onclick={() => turn('next')} aria-label="Next page">
			<Icon name="chevR" size={15} />
		</button>
	</div>
</div>

<style>
	.bs-stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		width: 100%;
		height: 100%;
		perspective: 2600px;
	}
	.bs-book {
		position: relative;
		transform-style: preserve-3d;
		border-radius: 4px;
		box-shadow: var(--shadow-lg);
	}
	.bs-spine {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 2px;
		transform: translateX(-1px);
		z-index: 3;
		pointer-events: none;
		background: linear-gradient(180deg, rgba(40, 20, 8, 0.35), rgba(40, 20, 8, 0.12));
		box-shadow: 0 0 14px 5px rgba(40, 20, 8, 0.22);
	}
	.bs-page {
		position: absolute;
		top: 0;
		overflow: hidden;
		backface-visibility: hidden;
	}
	.bs-leaf {
		position: absolute;
		top: 0;
		z-index: 4;
		transform-style: preserve-3d;
		will-change: transform;
		box-shadow: 0 24px 50px rgba(28, 16, 6, 0.28);
	}
	.bs-face {
		position: absolute;
		inset: 0;
		/* No `overflow` here: Firefox ignores `backface-visibility` on an element
		   that also clips overflow. The inner page already clips its own content. */
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
	}
	.bs-back {
		transform: rotateY(180deg);
	}
	/* moving sheen that reads as a page catching light while it curls */
	.bs-curl {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.bs-curl-front {
		background: linear-gradient(
			to var(--edge),
			rgba(255, 250, 235, 0.35),
			transparent 22%,
			transparent 100%
		);
	}
	.bs-curl-back {
		background: linear-gradient(105deg, rgba(40, 22, 9, 0.16), transparent 38%);
	}
	/* outer-edge click zones */
	.bs-zone {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 16%;
		border: none;
		background: none;
		cursor: pointer;
		z-index: 5;
		display: flex;
		align-items: center;
		padding: 0;
		color: #f0e2c8;
		transition: opacity 0.2s ease;
	}
	.bs-zone-prev {
		left: 0;
		justify-content: flex-start;
		padding-left: 8px;
	}
	.bs-zone-next {
		right: 0;
		justify-content: flex-end;
		padding-right: 8px;
	}
	.bs-zone:disabled {
		cursor: default;
		pointer-events: none;
	}
	.bs-chev {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 999px;
		background: rgba(28, 16, 6, 0.42);
		opacity: 0;
		transform: scale(0.85);
		transition:
			opacity 0.22s cubic-bezier(0.22, 1, 0.36, 1),
			transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
		backdrop-filter: blur(2px);
	}
	.bs-zone:not(:disabled):hover .bs-chev,
	.bs-zone:focus-visible .bs-chev {
		opacity: 1;
		transform: scale(1);
	}
	/* footer */
	.bs-footer {
		display: flex;
		align-items: center;
		gap: 14px;
		color: #f0e2c8;
		font-family: var(--font-chrome);
	}
	.bs-fbtn {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		border: 1px solid rgba(240, 226, 200, 0.18);
		background: rgba(28, 16, 6, 0.3);
		color: inherit;
		cursor: pointer;
		transition:
			background 0.18s ease,
			border-color 0.18s ease,
			transform 0.12s ease;
	}
	.bs-fbtn:not(:disabled):hover {
		background: rgba(28, 16, 6, 0.5);
		border-color: rgba(240, 226, 200, 0.35);
	}
	.bs-fbtn:not(:disabled):active {
		transform: scale(0.92);
	}
	.bs-fbtn:disabled {
		opacity: 0.32;
		cursor: default;
	}
	.bs-meter {
		position: relative;
		width: 180px;
		max-width: 32vw;
		height: 3px;
		border-radius: 999px;
		background: rgba(240, 226, 200, 0.16);
		overflow: hidden;
	}
	.bs-fill {
		position: absolute;
		inset: 0;
		border-radius: 999px;
		transform-origin: left center;
		background: linear-gradient(90deg, var(--gilt), var(--gilt-soft));
		transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.bs-count {
		font-size: 12.5px;
		letter-spacing: 0.02em;
		min-width: 120px;
	}
	.bs-of {
		opacity: 0.6;
		margin-left: 4px;
	}
	@media (prefers-reduced-motion: reduce) {
		.bs-fill,
		.bs-chev,
		.bs-fbtn {
			transition: none;
		}
	}
</style>
