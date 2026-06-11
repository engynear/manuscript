<script lang="ts">
	import type { ManuscriptSettings } from '$lib/types';
	import { fontFamilyFor, dropcapBackground, inkThemeForPaper } from '$lib/manuscript';

	interface Props {
		md: string;
		settings: ManuscriptSettings;
		compact?: boolean;
	}
	let { md, settings: s, compact = false }: Props = $props();

	type Block = { t: 'h1' | 'h2' | 'p'; text: string };

	const family = $derived(fontFamilyFor(s.fontStyle));
	const ink = $derived(inkThemeForPaper(s.paper));

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
			if (l.startsWith('## ')) {
				flush();
				blocks.push({ t: 'h2', text: l.slice(3) });
			} else if (l.startsWith('# ')) {
				flush();
				blocks.push({ t: 'h1', text: l.slice(2) });
			} else if (l.trim() === '') {
				flush();
			} else {
				para.push(l);
			}
		}
		flush();
		return blocks;
	}

	const blocks = $derived(parse(md));
	const firstParaIdx = $derived(blocks.findIndex((b) => b.t === 'p'));
	const pad = $derived(compact ? '30px 28px 28px' : '54px 52px 48px 84px');
</script>

<div
	style="position:relative;overflow:hidden;background-image:url({s.paper});background-size:cover;
		background-position:center;font-family:{family};color:{ink.ink};
		padding:{pad};font-size:{compact ? 14 : 17}px;line-height:1.7"
>
	<!-- subtle page lighting -->
	<div
		style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 36%,rgba(255,245,210,.16),transparent 43%),linear-gradient(90deg,rgba(68,33,13,.16),transparent 14%,transparent 86%,rgba(68,33,13,.14))"
	></div>

	<!-- margin ornament -->
	{#if s.ornament}
		<img
			src={s.ornament}
			alt=""
			style="position:absolute;left:{compact ? 12 : 22}px;top:{compact
				? 44
				: 60}px;height:72%;width:{compact ? 38 : 50}px;object-fit:contain;object-position:top;opacity:.95"
		/>
	{/if}

	<div style="position:relative;z-index:1">
		{#each blocks as b, i}
			{#if b.t === 'h1'}
				<h1
					style="text-align:center;margin:0 0 .2em;
						font-size:{compact ? '1.7em' : '2.1em'};font-weight:700;color:{ink.red}"
				>
					{b.text}
				</h1>
				{#if s.titleDivider}
					<img
						src={s.titleDivider}
						alt=""
						style="display:block;margin:.2em auto 1.1em;height:{compact
							? 22
							: 30}px;width:60%;object-fit:contain"
					/>
				{/if}
			{:else if b.t === 'h2'}
				{#if s.divider}
					<img
						src={s.divider}
						alt=""
						style="display:block;margin:1.1em auto .9em;height:{compact
							? 26
							: 36}px;width:55%;object-fit:contain"
					/>
				{/if}
				<h2
					style="text-align:center;margin:0 0 .7em;
						font-size:{compact ? '1.2em' : '1.4em'};font-weight:600;color:{ink.red};letter-spacing:.01em"
				>
					{b.text}
				</h2>
			{:else if i === firstParaIdx && s.dropcap}
				<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">
					<span
						style="position:relative;float:left;display:grid;place-items:center;overflow:hidden;
							width:{compact ? 52 : 64}px;height:{compact ? 52 : 64}px;margin:.05em .35em 0 0;
							background-color:{dropcapBackground(s.dropcap)};color:#fff4d6;
							font-weight:700;font-size:{compact ? 34 : 42}px;line-height:1"
					>
						<img
							src={s.dropcap}
							alt=""
							style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
						/>
						<span style="position:relative;z-index:1">{b.text.charAt(0)}</span>
					</span>{b.text.slice(1)}
				</p>
			{:else}
				<p style="margin:0 0 .85em;text-align:justify;hyphens:auto">{b.text}</p>
			{/if}
		{/each}
	</div>
</div>
