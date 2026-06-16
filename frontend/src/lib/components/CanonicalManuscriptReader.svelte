<script lang="ts">
	import { onMount } from 'svelte';
	import type { Book } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import BookCover from '$lib/components/BookCover.svelte';
	import { mediaUrl } from '$lib/api';

	interface Props {
		book: Book;
		mode?: 'spread' | 'single' | 'scroll';
		showCover?: boolean;
	}

	let { book, mode = 'spread', showCover = true }: Props = $props();

	let css = $state('');
	let pages = $state<string[]>([]);
	let error = $state('');
	let vw = $state(1280);
	let vh = $state(800);
	let index = $state(0);
	let turning = $state<{ dir: 1 | -1; target: number } | null>(null);

	const hasCover = $derived(showCover);
	const total = $derived(pages.length + (hasCover ? 1 : 0));
	const single = $derived(mode === 'single');
	const scroll = $derived(mode === 'scroll');
	const coverOnly = $derived(hasCover && mode === 'spread' && index === 0);
	const per = $derived(single || coverOnly ? 1 : 2);
	const A4 = 1.41421;
	const baseW = 794;
	const baseH = 1123;
	const targetH = $derived(
		scroll
			? Math.round(Math.min(920, Math.max(520, vw - 56) * A4))
			: single || coverOnly
				? Math.max(380, Math.min(880, Math.min(vh - 150, (vw - 96) * A4)))
				: Math.max(380, Math.min(760, Math.min(vh - 150, (vw - 104) / A4)))
	);
	const scale = $derived(targetH / baseH);
	const pageH = $derived(Math.round(baseH * scale));
	const pageW = $derived(Math.round(baseW * scale));
	const canPrev = $derived(!turning && index > 0);
	const canNext = $derived(!turning && index + per < total);
	const lastVisible = $derived(Math.min(total, index + per));
	const generatedStyle = $derived(`<${'style'}>${css}</${'style'}>`);

	function htmlFor(pageIndex: number): string {
		if (hasCover && pageIndex === 0) return '';
		return pages[pageIndex - (hasCover ? 1 : 0)] ?? '';
	}

	function targetFor(delta: 1 | -1): number {
		if (delta < 0) return index <= 1 ? 0 : Math.max(1, index - 2);
		return coverOnly ? 1 : index + per;
	}

	function go(delta: 1 | -1) {
		if (delta > 0 && !canNext) return;
		if (delta < 0 && !canPrev) return;
		const target = targetFor(delta);
		if (mode === 'spread' && !coverOnly && target > 0) {
			turning = { dir: delta, target };
			window.setTimeout(() => {
				index = target;
				turning = null;
			}, 760);
			return;
		}
		index = target;
	}

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLElement && /input|textarea|select|button|a/i.test(e.target.tagName)) return;
		if (e.key === 'ArrowRight' || e.key === 'PageDown') {
			e.preventDefault();
			go(1);
		}
		if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
			e.preventDefault();
			go(-1);
		}
	}

	async function load() {
		if (!book.contentHash) {
			error = 'Generated manuscript is not available';
			return;
		}
		try {
			// Public media asset served with Access-Control-Allow-Origin: * — a
			// credentialed request would be rejected (wildcard ACAO + credentials),
			// so fetch it anonymously.
			const res = await fetch(mediaUrl(`/media/generated/${book.contentHash}/manuscript.html`));
			if (!res.ok) throw new Error('Generated manuscript is not available');
			const source = await res.text();
			const doc = new DOMParser().parseFromString(source, 'text/html');
			css = Array.from(doc.querySelectorAll('style'))
				.map((node) => node.textContent ?? '')
				.join('\n');
			pages = Array.from(doc.querySelectorAll('.manuscript-sheet')).map((node) => node.outerHTML);
			error = pages.length ? '' : 'Generated manuscript is empty';
			index = 0;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Generated manuscript is not available';
		}
	}

	$effect(() => {
		void book.contentHash;
		if (typeof window !== 'undefined') void load();
	});

	$effect(() => {
		if (index >= total) index = Math.max(0, total - 1);
	});

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

{#snippet styleTag()}
	{@html generatedStyle}
{/snippet}

{#snippet coverPage()}
	<div class="cm-cover" style="width:{pageW}px;height:{pageH}px">
		<BookCover {book} w={Math.round(pageH / 1.5)} />
	</div>
{/snippet}

{#snippet manuscriptFace(pageIndex: number, side: 'single' | 'left' | 'right')}
	<div
		class="cm-render cm-page {side === 'right' ? 'cm-page-right' : ''}"
		style="--cm-scale:{scale};--cm-base-w:{baseW}px;--cm-base-h:{baseH}px"
	>
		{@render styleTag()}
		<div class="manuscript-root">
			<article class="manuscript-book">
				{@html htmlFor(pageIndex)}
			</article>
		</div>
	</div>
{/snippet}

{#snippet manuscriptPage(pageIndex: number, side: 'single' | 'left' | 'right')}
	<div class="cm-page-shell" style="width:{pageW}px;height:{pageH}px">
		{@render manuscriptFace(pageIndex, side)}
	</div>
{/snippet}

{#snippet turningLeaf()}
	{#if turning}
		{@const frontIndex = turning.dir === 1 ? index + 1 : index}
		{@const backIndex = turning.dir === 1 ? turning.target : turning.target + 1}
		{@const frontSide = turning.dir === 1 ? 'right' : 'left'}
		{@const backSide = turning.dir === 1 ? 'left' : 'right'}
		<div
			class="cm-leaf"
			class:turn-next={turning.dir === 1}
			class:turn-prev={turning.dir === -1}
			style="width:{pageW}px;height:{pageH}px;left:{turning.dir === 1 ? pageW : 0}px"
		>
			<div class="cm-leaf-face cm-leaf-front">
				{@render manuscriptFace(frontIndex, frontSide)}
				<div class="cm-leaf-shade"></div>
			</div>
			<div class="cm-leaf-face cm-leaf-back">
				{@render manuscriptFace(backIndex, backSide)}
				<div class="cm-leaf-shade back"></div>
			</div>
		</div>
	{/if}
{/snippet}

{#if error}
	<div class="cm-error">{error}</div>
{:else if !pages.length}
	<div class="cm-error">Loading manuscript...</div>
{:else if scroll}
	<div class="cm-scroll">
		{#if hasCover}
			{@render coverPage()}
		{/if}
		{#each pages as _, i}
			{@render manuscriptPage(i + (hasCover ? 1 : 0), 'single')}
		{/each}
	</div>
{:else}
	<div class="cm-stage">
		<div
			class="cm-book"
			class:single={single || coverOnly}
			style="height:{pageH}px"
		>
			{#if coverOnly}
				{@render coverPage()}
			{:else if single}
				{#if hasCover && index === 0}
					{@render coverPage()}
				{:else}
					{@render manuscriptPage(index, 'single')}
				{/if}
			{:else}
				{@const baseIndex = turning ? turning.target : index}
				{@render manuscriptPage(baseIndex, 'left')}
				{#if baseIndex + 1 < total}
					{@render manuscriptPage(baseIndex + 1, 'right')}
				{/if}
				{@render turningLeaf()}
			{/if}
			<button class="cm-zone cm-prev" disabled={!canPrev} aria-label="Previous page" onclick={() => go(-1)}>
				<span><Icon name="chevL" size={22} /></span>
			</button>
			<button class="cm-zone cm-next" disabled={!canNext} aria-label="Next page" onclick={() => go(1)}>
				<span><Icon name="chevR" size={22} /></span>
			</button>
		</div>
		<div class="cm-footer">
			<button class="cm-fbtn" disabled={!canPrev} onclick={() => go(-1)} aria-label="Previous page">
				<Icon name="chevL" size={15} />
			</button>
			<div class="cm-meter" aria-hidden="true">
				<span style="transform:scaleX({total > 1 ? lastVisible / total : 1})"></span>
			</div>
			<div class="cm-count">p. {index + 1}{lastVisible > index + 1 ? `-${lastVisible}` : ''} <span>of {total}</span></div>
			<button class="cm-fbtn" disabled={!canNext} onclick={() => go(1)} aria-label="Next page">
				<Icon name="chevR" size={15} />
			</button>
		</div>
	</div>
{/if}

<style>
	:global(.cm-render .manuscript-root) {
		min-height: 0;
		background: transparent;
	}
	:global(.cm-render .manuscript-book) {
		display: block;
		padding: 0;
	}
	:global(.cm-render .manuscript-sheet) {
		width: var(--cm-base-w) !important;
		height: var(--cm-base-h) !important;
		max-width: none !important;
		aspect-ratio: auto !important;
		box-shadow: none !important;
		break-after: auto !important;
		page-break-after: auto !important;
	}
	:global(.cm-render .manuscript-sheet:last-child) {
		page-break-after: auto !important;
	}
	.cm-stage {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
	}
	.cm-book {
		position: relative;
		display: flex;
		align-items: stretch;
		justify-content: center;
		border-radius: 4px;
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		background: #2c241b;
		perspective: 1800px;
	}
	.cm-book.single {
		width: auto;
	}
	.cm-page-shell {
		position: relative;
		overflow: hidden;
		background: #2c241b;
		backface-visibility: hidden;
		transform-style: preserve-3d;
	}
	.cm-leaf {
		position: absolute;
		top: 0;
		z-index: 6;
		transform-style: preserve-3d;
		pointer-events: none;
	}
	.cm-leaf.turn-next {
		transform-origin: left center;
		animation: cm-turn-next 0.76s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.cm-leaf.turn-prev {
		transform-origin: right center;
		animation: cm-turn-prev 0.76s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.cm-leaf-face {
		position: absolute;
		inset: 0;
		overflow: hidden;
		background: #2c241b;
		backface-visibility: hidden;
		box-shadow: 0 0 28px rgba(26, 13, 5, 0.28);
	}
	.cm-leaf-back {
		transform: rotateY(180deg);
	}
	.cm-leaf-shade {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(90deg, rgba(34, 17, 6, 0.36), transparent 34%, rgba(255, 238, 190, 0.08) 68%, rgba(34, 17, 6, 0.22));
		mix-blend-mode: multiply;
		opacity: 0.5;
	}
	.cm-leaf-shade.back {
		background: linear-gradient(270deg, rgba(34, 17, 6, 0.3), transparent 42%, rgba(255, 238, 190, 0.1));
	}
	@keyframes cm-turn-next {
		0% {
			transform: rotateY(0deg);
			filter: brightness(1);
		}
		42% {
			filter: brightness(0.92);
		}
		100% {
			transform: rotateY(-180deg);
			filter: brightness(1);
		}
	}
	@keyframes cm-turn-prev {
		0% {
			transform: rotateY(0deg);
			filter: brightness(1);
		}
		42% {
			filter: brightness(0.92);
		}
		100% {
			transform: rotateY(180deg);
			filter: brightness(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cm-leaf.turn-next,
		.cm-leaf.turn-prev {
			animation-duration: 1ms;
		}
	}
	.cm-page {
		position: absolute;
		left: 0;
		top: 0;
		width: var(--cm-base-w);
		height: var(--cm-base-h);
		overflow: hidden;
		background: #2c241b;
		transform: scale(var(--cm-scale));
		transform-origin: top left;
	}
	.cm-page-right :global(.manuscript-margin-ornament) {
		left: auto !important;
		right: 30px !important;
		transform: scaleX(-1);
	}
	.cm-page-right :global(.manuscript-content) {
		padding-left: 68px !important;
		padding-right: 147px !important;
	}
	.cm-cover {
		display: grid;
		place-items: center;
		overflow: hidden;
		background: color-mix(in srgb, var(--leather) 56%, #1f1109);
	}
	.cm-scroll {
		display: grid;
		justify-items: center;
		gap: 28px;
		width: 100%;
		padding: 20px 0 48px;
	}
	.cm-zone {
		position: absolute;
		z-index: 4;
		top: 0;
		bottom: 0;
		width: 16%;
		border: none;
		background: transparent;
		color: #f0e2c8;
		cursor: pointer;
	}
	.cm-prev {
		left: 0;
	}
	.cm-next {
		right: 0;
	}
	.cm-zone:disabled {
		pointer-events: none;
		cursor: default;
	}
	.cm-zone span {
		position: absolute;
		top: 50%;
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 999px;
		background: rgba(28, 16, 6, 0.42);
		opacity: 0;
		transform: translateY(-50%) scale(0.9);
		transition:
			opacity 0.18s ease,
			transform 0.18s ease;
	}
	.cm-prev span {
		left: 8px;
	}
	.cm-next span {
		right: 8px;
	}
	.cm-zone:not(:disabled):hover span,
	.cm-zone:focus-visible span {
		opacity: 1;
		transform: translateY(-50%) scale(1);
	}
	.cm-footer {
		display: flex;
		align-items: center;
		gap: 14px;
		color: #f0e2c8;
		font-family: var(--font-chrome);
	}
	.cm-fbtn {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		border: 1px solid rgba(240, 226, 200, 0.18);
		background: rgba(28, 16, 6, 0.3);
		color: inherit;
		cursor: pointer;
	}
	.cm-fbtn:disabled {
		opacity: 0.32;
		cursor: default;
	}
	.cm-meter {
		position: relative;
		width: 180px;
		max-width: 32vw;
		height: 3px;
		border-radius: 999px;
		background: rgba(240, 226, 200, 0.16);
		overflow: hidden;
	}
	.cm-meter span {
		position: absolute;
		inset: 0;
		transform-origin: left center;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--gilt), var(--gilt-soft));
		transition: transform 0.22s ease;
	}
	.cm-count {
		min-width: 118px;
		font-size: 12.5px;
		letter-spacing: 0.02em;
	}
	.cm-count span {
		opacity: 0.6;
	}
	.cm-error {
		color: #f0e2c8;
		padding: 48px;
		text-align: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.cm-zone span,
		.cm-meter span {
			transition: none;
		}
	}
</style>
