<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { Book, BookImage, ManuscriptPlan, ManuscriptSettings } from '$lib/types';
	import {
		fontFamilyFor,
		dropcapBackground,
		inkThemeForPaper,
		buildBlocks,
		dropFirst,
		paginate
	} from '$lib/manuscript';
	import type { ManuscriptBlock, PageSeg } from '$lib/manuscript';
	import { mediaUrl } from '$lib/api';
	import Icon from '$lib/components/Icon.svelte';
	import BookCover from '$lib/components/BookCover.svelte';

	interface Props {
		md: string;
		settings: ManuscriptSettings;
		/** 'spread' = facing two-page book, 'single' = one page at a time. */
		mode?: 'spread' | 'single';
		plan?: ManuscriptPlan | null;
		images?: BookImage[];
		/** When set, the reader opens on a dedicated cover page. */
		book?: Book | null;
		showCover?: boolean;
	}
	let { md, settings: s, mode = 'spread', plan = null, images = [], book = null, showCover = true }: Props = $props();

	// ---- spread + page-turn state ----
	let spread = $state(0); // index of the left/only page (even in spread mode)
	let turning = $state<{ dir: 'next' | 'prev' } | null>(null);
	let leafEl = $state<HTMLDivElement>();

	const hasCover = $derived(showCover);
	const coverTitle = $derived(book?.title || plan?.title || '');
	const coverSubtitle = $derived(book?.subtitle || plan?.subtitle || '');
	const coverAuthor = $derived(book?.author || '');

	const single = $derived(mode === 'single');
	const coverOnly = $derived(hasCover && !single && spread === 0);
	const per = $derived(single || coverOnly ? 1 : 2); // pages advanced per turn

	const family = $derived(fontFamilyFor(s.fontStyle));
	const ink = $derived(inkThemeForPaper(s.paper));

	// ---- responsive sizing: fit the page(s) (H = W·√2) into the viewport ----
	let vw = $state(1280);
	let vh = $state(800);
	const A4 = 1.41421;
	const pageH = $derived(
		single || coverOnly
			? Math.max(360, Math.min(880, Math.min(vh - 150, (vw - 96) * A4)))
			: Math.max(360, Math.min(760, Math.min(vh - 150, (vw - 96) / A4)))
	);
	const pageW = $derived(Math.round(pageH / A4));

	const padX = $derived(Math.round(pageW * 0.11));
	const padTop = $derived(Math.round(pageH * 0.085));
	const padBot = $derived(Math.round(pageH * 0.07));
	const ornW = $derived(Math.round(pageW * 0.15));
	const fs = $derived(Math.max(14, Math.round(pageW * 0.044)));
	const contentH = $derived(pageH - padTop - padBot);

	const blocks = $derived(buildBlocks(md, plan, images));

	// ---- pagination: measure each block, greedily pack into A4-height pages ----
	// Long paragraphs are split across pages so no text is ever clipped.
	let measureEl: HTMLDivElement | undefined = $state();
	let splitEl: HTMLDivElement | undefined = $state(); // measures candidate paragraph slices
	let contentPages = $state<PageSeg[][]>([]); // arrays of placements (content only)
	// A dedicated cover page is prepended as page 0 when a cover is shown.
	const pages = $derived<PageSeg[][]>(hasCover ? [[], ...contentPages] : contentPages);

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
		// The reader is Model B: its own responsive geometry, and it always breaks
		// at every h1/h2 (chapter-per-page) regardless of the print page-break
		// setting. It shares only the algorithm with the preview/PDF (Model A).
		const next = paginate(
			blocks,
			contentH,
			fs,
			{ breakMode: 'newPage', dropcap: !!s.dropcap },
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
		contentPages = next;
		const t = (hasCover ? 1 : 0) + next.length;
		if (spread > t - 1) {
			const last = Math.max(0, t - 1);
			spread = single ? last : last & ~1;
		}
	}

	$effect(() => {
		void [md, s, pageW, contentH, plan, images];
		let cancelled = false;
		// rAF flushes layout before measuring; the timeout is a fallback for
		// hidden/throttled tabs where rAF may not fire.
		const run = () => {
			if (cancelled) return;
			requestAnimationFrame(runPaginate);
			setTimeout(runPaginate, 60);
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

	const total = $derived(pages.length);
	const canNext = $derived(!turning && spread + per < total);
	const canPrev = $derived(!turning && spread > 0);

	// Underneath the flipping leaf we already paint the destination page(s) so
	// they are revealed seamlessly as the leaf lifts.
	const leftIdx = $derived(turning?.dir === 'prev' ? spread - 2 : turning && coverOnly ? 1 : spread);
	const rightIdx = $derived(turning?.dir === 'next' ? (coverOnly ? 2 : spread + 3) : spread + 1);
	const leafFront = $derived(turning?.dir === 'next' ? spread + 1 : spread);
	const leafBack = $derived(turning?.dir === 'next' ? spread + 2 : spread - 1);
	// Single mode: the static layer shows the destination page; the leaf is the
	// current page peeling away to reveal it (its back is blank paper, idx -1).
	const centerIdx = $derived(turning && single ? (turning.dir === 'next' ? spread + 1 : spread - 1) : spread);
	const leafFrontIdx = $derived(single || coverOnly ? spread : leafFront);
	const leafBackIdx = $derived(single ? -1 : coverOnly ? 1 : leafBack);

	const lastPage = $derived(Math.min(spread + per, total));

	// Keep the index aligned when the layout mode changes.
	$effect(() => {
		if (mode !== 'spread') return;
		if (hasCover) {
			if (spread > 0 && spread % 2 === 0) spread = spread - 1;
		} else if (spread % 2 === 1) {
			spread = spread - 1;
		}
	});

	async function turn(dir: 'next' | 'prev') {
		if (turning) return;
		if (dir === 'next' && spread + per >= total) return;
		if (dir === 'prev' && spread <= 0) return;
		const target = dir === 'next' ? spread + per : hasCover && spread <= 1 ? 0 : spread - per;
		if (single) {
			spread = target;
			return;
		}
		if (dir === 'prev' && hasCover && spread === 1) {
			spread = 0;
			return;
		}
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
		spread = target;
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
			<img src={s.divider} alt="" style="display:block;margin:1em auto;height:26px;width:48%;object-fit:contain;opacity:.9" />
		{/if}
	{:else if b.t === 'illustration'}
		<figure style="margin:1em 0;text-align:center">
			<img src={mediaUrl(b.url)} alt={b.caption} style="display:block;margin:0 auto;max-width:78%;max-height:{Math.round(contentH * 0.5)}px;object-fit:contain" />
			{#if b.caption}
				<figcaption style="margin-top:.4em;font-style:italic;font-size:.85em;color:{ink.fadedInk}">{b.caption}</figcaption>
			{/if}
		</figure>
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
	{:else if b.t === 'p'}
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

<!-- dedicated cover page: cover art if present, otherwise a centered title page -->
{#snippet coverFace()}
	{#if book}
		<div style="position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb, var(--leather) 58%, #1e1007)">
			<BookCover {book} w={Math.round(pageH / 1.5)} />
		</div>
	{:else}
		<div
			style="position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:{padTop}px {padX}px;gap:{Math.round(
				fs * 0.7
			)}px"
		>
			{#if s.titleDivider}
				<img src={s.titleDivider} alt="" style="height:28px;width:52%;object-fit:contain;opacity:.85" />
			{/if}
			<h1 style="font-family:{family};font-size:{Math.round(fs * 2)}px;font-weight:700;color:{ink.red};margin:0;line-height:1.06">
				{coverTitle}
			</h1>
			{#if coverSubtitle}
				<div style="font-style:italic;font-size:{Math.round(fs * 1.05)}px;color:{ink.fadedInk}">{coverSubtitle}</div>
			{/if}
			{#if s.titleDivider}
				<img src={s.titleDivider} alt="" style="height:24px;width:40%;object-fit:contain;opacity:.7" />
			{/if}
			{#if coverAuthor}
				<div style="margin-top:{Math.round(fs)}px;letter-spacing:.14em;text-transform:uppercase;font-size:{Math.round(
					fs * 0.78
				)}px;color:{ink.ink}">
					{coverAuthor}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<!-- one page face: paper, gutter shading, ornament, content. side decides the spine edge. -->
{#snippet face(idx: number, side: 'left' | 'right' | 'single')}
	<div
		style="position:absolute;inset:0;overflow:hidden;
			background-image:url({s.paper});background-size:cover;background-position:center;
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
		{#if hasCover && idx === 0}
			{@render coverFace()}
		{:else if pages[idx]}
			{#if s.ornament}
				<img
					src={s.ornament}
					alt=""
					style="position:absolute;{side === 'right'
						? `right:${Math.round(padX * 0.3)}px;transform:scaleX(-1)`
						: `left:${Math.round(padX * 0.3)}px`};top:{padTop}px;height:{contentH}px;width:{ornW -
						6}px;object-fit:contain;object-position:top;opacity:.95"
				/>
			{/if}
			<div
				style="position:relative;z-index:1;height:100%;overflow:hidden;padding:{padTop}px {side === 'right'
					? padX + ornW
					: padX}px {padBot}px {side === 'right' ? padX : padX + ornW}px"
			>
				{#each pages[idx] as seg}
					{@render segView(seg)}
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
		{#each blocks as b}
			<div style="display:flow-root">{@render blockView(b)}</div>
		{/each}
	</div>

	<!-- single-paragraph measurer for splitting long paragraphs across pages -->
	<div
		bind:this={splitEl}
		aria-hidden="true"
		style="position:absolute;left:-99999px;top:0;visibility:hidden;display:flow-root;width:{pageW -
			padX * 2 -
			ornW}px;font-family:{family};font-size:{fs}px;line-height:1.7;color:{ink.ink}"
	></div>

	<div
		class="bs-book"
		class:cover-opening={Boolean(turning && coverOnly)}
		style="width:{single || (coverOnly && !turning) ? pageW : pageW * 2}px;height:{pageH}px"
		role="group"
		aria-label="Page {spread + 1}{single ? '' : ` to ${lastPage}`} of {total}"
	>
		{#if coverOnly && !turning}
			<div class="bs-page" style="left:0;width:{pageW}px;height:{pageH}px;border-radius:4px">
				{@render face(spread, 'single')}
			</div>
		{:else if single}
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
					left:{coverOnly ? 0 : !single && turning.dir === 'next' ? pageW : 0}px;
					transform-origin:{turning.dir === 'next' ? 'left center' : 'right center'}"
			>
				<div class="bs-face bs-front">
					{@render face(
						leafFrontIdx,
						single || coverOnly ? 'single' : turning.dir === 'next' ? 'right' : 'left'
					)}
					<div class="bs-curl bs-curl-front" style="--edge:{turning.dir === 'next' ? 'left' : 'right'}"></div>
				</div>
				<div class="bs-face bs-back">
					{@render face(leafBackIdx, single || coverOnly ? 'single' : turning.dir === 'next' ? 'left' : 'right')}
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
	.bs-book.cover-opening {
		overflow: hidden;
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
