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
	const w = $derived(34 + ((book.pageCount % 5) * 5));
	const sc = $derived(h / 230);
</script>

<button
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
			font-weight:600;font-size:{Math.max(10, 12.5 * sc)}px;letter-spacing:.04em;white-space:nowrap;
			text-shadow:0 1px 1px rgba(0,0,0,.45);max-height:64%;overflow:hidden"
	>
		{spineTextFor(book)}
	</div>
	<div style="width:72%;display:grid;gap:3px">
		<div
			style="width:6px;height:6px;transform:rotate(45deg);border:1px solid {pal.foil};margin:2px auto;opacity:.85"
		></div>
		<div style="height:1px;background:{pal.foil};opacity:.5"></div>
	</div>
</button>
