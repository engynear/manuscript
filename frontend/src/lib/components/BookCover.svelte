<script lang="ts">
	import type { Book } from '$lib/types';
	import { paletteFor } from '$lib/covers';
	import { shade } from '$lib/shade';
	import { mediaUrl } from '$lib/api';

	interface Props {
		book: Book;
		w?: number;
		title?: boolean;
		onclick?: () => void;
	}
	let { book, w = 150, title = true, onclick }: Props = $props();

	const pal = $derived(paletteFor(book));
	const coverColor = $derived(pal.cover ?? pal.spine);
	const artSrc = $derived(mediaUrl(book.cover?.artUrl));
	let artFailed = $state(false);
	const titleColor = $derived(book.cover?.titleColor || pal.fg);
	const hideTitle = $derived(Boolean(book.cover?.hideTitle));
	const displayTitle = $derived(book.cover?.titleText || book.title);
	const h = $derived(Math.round(w * 1.5));
	const sc = $derived(w / 150);

	// Shrink long titles so the whole thing fits within the cover's text block
	// without breaking words — size against both total length and the longest word.
	const titleSize = $derived(
		(() => {
			const base = Math.max(11, 17 * sc);
			const t = displayTitle || '';
			const len = t.length;
			const longest = t.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
			// usable width of the title block ≈ 80% of the cover, advance ≈ 0.56·size
			const widthPx = w * 0.8;
			const byWord = widthPx / (Math.max(1, longest) * 0.68);
			const byLen = len <= 18 ? base : base * (18 / len);
			const min = Math.max(9, 11 * sc);
			return Math.max(min, Math.min(base, byWord, byLen));
		})()
	);

	$effect(() => {
		void artSrc;
		artFailed = false;
	});
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
		coverColor,
		1.05
	)} 12%,{coverColor} 88%);
		box-shadow:var(--shadow-md),inset 5px 0 8px rgba(0,0,0,.34),inset -2px 0 4px rgba(255,255,255,.07)"
>
	<div style="position:absolute;left:{6 * sc}px;top:0;bottom:0;width:1.5px;background:rgba(0,0,0,.28)"></div>
	<div style="position:absolute;left:{9 * sc}px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.08)"></div>

	{#if artSrc && !artFailed}
		<img
			src={artSrc}
			alt=""
			onerror={() => (artFailed = true)}
			style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
		/>
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

	{#if title && !hideTitle}
		<div style="position:absolute;left:12%;right:8%;bottom:7%;text-align:left">
			<div
				style="font-family:var(--font-display);font-weight:700;line-height:1.08;color:{titleColor};
					font-size:{titleSize}px;letter-spacing:.01em;text-shadow:0 1px 1px rgba(0,0,0,.4);
					overflow-wrap:break-word;white-space:pre-line"
			>
				{displayTitle}
			</div>
			{#if book.author}
				<div style="width:{26 * sc}px;height:1px;background:{pal.foil};margin:{7 * sc}px 0;opacity:.8"></div>
				<div
					style="font-family:var(--font-display);font-size:{Math.max(8, 9.5 * sc)}px;letter-spacing:.16em;text-transform:uppercase;opacity:.85;color:{titleColor}"
				>
					{book.author}
				</div>
			{/if}
		</div>
	{/if}
</div>
