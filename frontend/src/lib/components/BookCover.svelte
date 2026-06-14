<script lang="ts">
	import type { Book } from '$lib/types';
	import { paletteFor } from '$lib/covers';
	import { shade } from '$lib/shade';

	interface Props {
		book: Book;
		w?: number;
		title?: boolean;
		onclick?: () => void;
	}
	let { book, w = 150, title = true, onclick }: Props = $props();

	const pal = $derived(paletteFor(book));
	const h = $derived(Math.round(w * 1.5));
	const sc = $derived(w / 150);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	role={onclick ? 'button' : undefined}
	tabindex={onclick ? 0 : undefined}
	onclick={onclick}
	onkeydown={(e) => onclick && (e.key === 'Enter' || e.key === ' ') && onclick()}
	style="width:{w}px;height:{h}px;position:relative;flex:0 0 auto;overflow:hidden;
		border-radius:3px {5 * sc}px {5 * sc}px 3px;color:{pal.fg};cursor:{onclick ? 'pointer' : 'default'};
		background:linear-gradient(110deg,{pal.spine} 0%,{shade(pal.spine, 1.16)} 7%,{shade(
		pal.spine,
		1.05
	)} 12%,{pal.spine} 88%);
		box-shadow:var(--shadow-md),inset 5px 0 8px rgba(0,0,0,.34),inset -2px 0 4px rgba(255,255,255,.07)"
>
	<div style="position:absolute;left:{6 * sc}px;top:0;bottom:0;width:1.5px;background:rgba(0,0,0,.28)"></div>
	<div style="position:absolute;left:{9 * sc}px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.08)"></div>

	{#if book.cover?.artUrl}
		<img src={book.cover.artUrl} alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
	{:else}
		<!-- procedural illumination panel -->
		<div
			style="position:absolute;inset:11% 12% 30%;border:1px solid {pal.foil};
				box-shadow:inset 0 0 0 3px rgba(0,0,0,.12),inset 0 0 0 4px {pal.foil}55;
				display:grid;place-items:center;overflow:hidden;
				background:radial-gradient(120% 100% at 50% 0%,{pal.fg}22,transparent 60%)"
		>
			<div style="display:grid;gap:14%;place-items:center">
				<div
					style="width:26px;height:26px;transform:rotate(45deg);border:1.5px solid {pal.foil};box-shadow:inset 0 0 0 3px {pal.fg}33"
				></div>
				<div style="width:60%;height:1px;background:{pal.foil};opacity:.7"></div>
			</div>
		</div>
	{/if}

	{#if title}
		<div style="position:absolute;left:12%;right:8%;bottom:7%;text-align:left">
			<div
				style="font-family:var(--font-display);font-weight:700;line-height:1.08;color:{pal.fg};
					font-size:{Math.max(11, 17 * sc)}px;letter-spacing:.01em;text-shadow:0 1px 1px rgba(0,0,0,.4)"
			>
				{book.title}
			</div>
			<div style="width:{26 * sc}px;height:1px;background:{pal.foil};margin:{7 * sc}px 0;opacity:.8"></div>
			<div
				style="font-family:var(--font-display);font-size:{Math.max(8, 9.5 * sc)}px;letter-spacing:.16em;text-transform:uppercase;opacity:.85"
			>
				{book.author}
			</div>
		</div>
	{/if}
</div>
