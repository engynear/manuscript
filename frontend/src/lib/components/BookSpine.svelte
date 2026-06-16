<script lang="ts">
	import type { Book } from '$lib/types';
	import { paletteFor, spineTextFor } from '$lib/covers';
	import { shade } from '$lib/shade';

	interface Props {
		book: Book;
		h?: number;
		onclick?: () => void;
	}
	let { book, h = 230, onclick }: Props = $props();

	const pal = $derived(paletteFor(book));
	const sc = $derived(h / 230);

	const spineText = $derived(spineTextFor(book));
	const w = $derived(
		Math.min(70 * sc, 34 * sc + Math.ceil(spineText.length / 18) * 7 * sc + ((book.pageCount % 5) * 3))
	);
	// Shrink the title (and let it wrap to a 2nd column) so the whole thing fits.
	const titleSize = $derived(
		(() => {
			const base = Math.max(9, 12.5 * sc);
			// usable vertical run for the (rotated) text, in px — allow up to 2 columns
			const columns = Math.max(1, Math.floor(w / Math.max(10, 12 * sc)));
			const avail = h * 0.68 * columns;
			// rough advance per character for the display face
			const fit = avail / Math.max(1, spineText.length * 0.95);
			return Math.max(6.5, Math.min(base, fit));
		})()
	);
</script>

<button
	class="spine"
	onclick={onclick}
	title={book.title}
	style="width:{w}px;height:{h}px;position:relative;flex:0 0 auto;cursor:pointer;border:none;
		border-radius:2px 2px 3px 3px;color:{pal.fg};padding:{12 * sc}px 0;
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
		style="writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--font-display);
			font-weight:600;font-size:{titleSize}px;letter-spacing:.02em;line-height:1.05;text-align:center;
			text-shadow:0 1px 1px rgba(0,0,0,.45);max-height:72%;max-width:calc(100% - {10 * sc}px);
			overflow:hidden;overflow-wrap:anywhere;word-break:break-word"
	>
		{spineText}
	</div>
	<div style="width:72%;display:grid;gap:3px">
		<div
			style="width:6px;height:6px;transform:rotate(45deg);border:1px solid {pal.foil};margin:2px auto;opacity:.85"
		></div>
		<div style="height:1px;background:{pal.foil};opacity:.5"></div>
	</div>
</button>

<style>
	.spine {
		transition:
			transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
			box-shadow 0.2s ease;
		transform-origin: bottom center;
	}
	.spine:hover {
		transform: translateY(-10px);
		box-shadow: var(--shadow-lg);
	}
</style>
