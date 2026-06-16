<script lang="ts">
	import type { Book } from '$lib/types';
	import { paletteFor, spineTextFor } from '$lib/covers';
	import { shade } from '$lib/shade';
	import BookCover from './BookCover.svelte';

	interface Props {
		book: Book;
		h?: number;
		onclick?: () => void;
		/** Turn-to-cover on hover/focus. Disable while dragging so the book resets. */
		turn?: boolean;
	}
	let { book, h = 230, onclick, turn = true }: Props = $props();

	const pal = $derived(paletteFor(book));
	const spineTextColor = $derived(book.cover?.spineTextColor || pal.fg);
	const sc = $derived(h / 230);

	const spineText = $derived(spineTextFor(book));
	const spineLines = $derived(
		spineText
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
	);
	const lineCount = $derived(Math.max(1, spineLines.length));
	const longestLine = $derived(spineLines.reduce((max, line) => Math.max(max, line.length), 0));
	const charCount = $derived(spineText.replace(/\s+/g, '').length);

	// Widen the spine for long titles so the name has room to breathe before we
	// have to shrink the type. Width also grows with explicit line breaks.
	const longTitle = $derived(longestLine >= 13 || charCount >= 16);
	const w = $derived(
		Math.min(
			102 * sc,
			40 * sc +
				Math.max(0, lineCount - 1) * 13 * sc +
				(longTitle ? 16 * sc : 0) +
				(book.pageCount % 5) * 3
		)
	);

	const baseSize = $derived(Math.max(12, 20 * sc));
	const MIN_SIZE = 9;

	// The front cover hinged to the spine; its height matches the spine so the
	// turning book reads as one solid object. Cover height = width * 1.5.
	const coverW = $derived(Math.round(h / 1.5));

	// Measure the rendered (rotated, possibly wrapped) title and shrink the font
	// until it no longer overflows its box — guarantees the full name is visible.
	let titleEl = $state<HTMLDivElement>();
	let fitSize = $state(0);

	$effect(() => {
		// Re-fit whenever the text, geometry, or base size changes.
		void spineText;
		void w;
		void h;
		void baseSize;
		const el = titleEl;
		const area = el?.parentElement;
		if (!el || !area) return;
		const raf = requestAnimationFrame(() => {
			// Measure the text's natural size against the definite container box
			// (`area`). Comparing against the element's own client size is unreliable
			// because it shrink-wraps to content and reports a few px of glyph overhang.
			let size = baseSize;
			el.style.fontSize = `${size}px`;
			let guard = 64;
			while (
				guard-- > 0 &&
				size > MIN_SIZE &&
				(el.scrollHeight > area.clientHeight + 1 || el.scrollWidth > area.clientWidth + 1)
			) {
				size -= 0.5;
				el.style.fontSize = `${size}px`;
			}
			fitSize = size;
		});
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="stage" class:no-turn={!turn} style="width:{w}px;height:{h}px;flex:0 0 auto;--coverW:{coverW}px">
<div class="pivot">
<button
	class="spine"
	onclick={onclick}
	title={book.title}
	style="width:{w}px;height:{h}px;position:absolute;inset:0;cursor:pointer;border:none;
		border-radius:2px 2px 3px 3px;color:{spineTextColor};padding:{12 * sc}px 0;
		display:flex;flex-direction:column;align-items:center;justify-content:space-between;
		background:linear-gradient(90deg,{shade(pal.spine, 0.78)} 0%,{pal.spine} 14%,{shade(
		pal.spine,
		1.14
	)} 50%,{pal.spine} 86%,{shade(pal.spine, 0.74)} 100%);
		box-shadow:inset 0 2px 0 rgba(255,255,255,.1),inset 0 -3px 5px rgba(0,0,0,.34),1px 0 2px rgba(0,0,0,.25)"
>
	<div style="width:72%;display:grid;gap:3px">
		<div style="height:1.5px;background:{pal.foil};opacity:.8"></div>
		<div style="height:1px;background:{pal.foil};opacity:.5"></div>
	</div>
	<div
		style="flex:1 1 0;min-height:0;width:100%;display:grid;place-items:center;
			overflow:hidden;padding:0 {4 * sc}px;box-sizing:border-box"
	>
		<div
			bind:this={titleEl}
			style="writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--font-display);
				font-weight:700;font-size:{fitSize || baseSize}px;letter-spacing:.01em;line-height:1.08;text-align:center;
				text-shadow:0 1px 1px rgba(0,0,0,.45);max-height:100%;max-width:100%;
				overflow:hidden;overflow-wrap:anywhere;word-break:break-word;white-space:pre-line"
		>
			{spineText}
		</div>
	</div>
	<div style="width:72%;display:grid;gap:3px">
		<div
			style="width:6px;height:6px;transform:rotate(45deg);border:1px solid {pal.foil};margin:2px auto;opacity:.85"
		></div>
		<div style="height:1px;background:{pal.foil};opacity:.5"></div>
	</div>
</button>
<div class="cover-face">
	<BookCover {book} w={coverW} {onclick} />
</div>
</div>
</div>

<style>
	/* Perspective stage: keeps the book's footprint on the shelf while letting the
	   3D rotation overflow toward the viewer. */
	.stage {
		position: relative;
		perspective: 1600px;
		transform-style: preserve-3d;
	}
	/* The book pivots clockwise about its left edge: the spine swings away to the
	   left while the front cover unfolds in from the right, instead of jumping up. */
	.pivot {
		position: absolute;
		inset: 0;
		transform-style: preserve-3d;
		transform-origin: left center;
		transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
	}
	/* Trigger on focus-within too so keyboard users see the cover on tab. */
	.stage:hover,
	.stage:focus-within {
		z-index: 10;
	}
	.stage:not(.no-turn):hover .pivot,
	.stage:not(.no-turn):focus-within .pivot {
		transform: translateZ(40px) rotateY(-72deg);
	}
	/* While dragging, never turn — the book stays a flat spine so it resets. */
	.stage.no-turn .pivot {
		transform: none;
	}
	.stage.no-turn .cover-face {
		display: none;
	}

	.spine {
		backface-visibility: hidden;
	}
	/* Front cover hinged at the spine's right edge (the binding): folded back into
	   the shelf at rest (edge-on, invisible) and unfolding flush beside the spine
	   as the book turns, so the two meet at the seam without overlapping. */
	.cover-face {
		position: absolute;
		top: 0;
		left: 100%;
		height: 100%;
		width: var(--coverW);
		transform-origin: left center;
		transform: rotateY(90deg);
		backface-visibility: hidden;
		box-shadow: var(--shadow-lg);
	}

	@media (prefers-reduced-motion: reduce) {
		.pivot {
			transition: none;
		}
		/* No turn for motion-sensitive users — keep the gentle lift instead. */
		.stage:hover .pivot,
		.stage:focus-within .pivot {
			transform: translateY(-10px);
		}
		.cover-face {
			display: none;
		}
	}
</style>
