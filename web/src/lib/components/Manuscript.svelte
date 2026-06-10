<script lang="ts">
	import type { ManuscriptSettings } from '$lib/types';

	interface Props {
		md: string;
		settings: ManuscriptSettings;
		compact?: boolean;
	}
	let { md, settings: s, compact = false }: Props = $props();

	type Block = { t: 'h1' | 'h2' | 'p'; text: string };

	const fontMap: Record<string, string> = {
		'EB Garamond': 'var(--font-manuscript)',
		Cinzel: 'var(--font-display)',
		'IM Fell English': 'var(--font-scribe)',
		Handwritten: 'var(--font-scribe)'
	};

	const bodyFont = $derived(
		s.handwritten ? 'var(--font-scribe)' : (fontMap[s.font] ?? 'var(--font-manuscript)')
	);

	function parse(src: string): Block[] {
		const lines = (src || '').split('\n');
		const blocks: Block[] = [];
		let para: string[] = [];
		const flush = () => {
			if (para.length) {
				blocks.push({ t: 'p', text: para.join(' ') });
				para = [];
			}
		};
		for (const l of lines) {
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

	function dividerGlyph(d: string): string {
		return d === 'asterism' ? '⁂' : '❦';
	}

	// Index of the first paragraph (for the drop cap).
	const firstParaIdx = $derived(blocks.findIndex((b) => b.t === 'p'));
</script>

<div
	class="ms-page"
	style="background:{s.tint};font-family:{bodyFont};
		padding:{compact ? '26px 30px' : '54px 58px'};
		font-size:{compact ? 15 : 18.5}px;position:relative"
>
	{#if s.ornament === 'vine'}
		<div
			style="position:absolute;left:14px;top:40px;bottom:40px;width:5px;border-left:1px solid var(--gilt);opacity:.35"
		></div>
	{/if}

	{#each blocks as b, i}
		{#if b.t === 'h1'}
			<h1
				style="font-size:{compact ? '1.7em' : '2.05em'};text-align:center;margin:0 0 .15em;color:var(--ink)"
			>
				{b.text}
			</h1>
		{:else if b.t === 'h2'}
			{#if s.divider !== 'none'}
				{#if s.divider === 'rule'}
					<div
						style="width:90px;height:1px;background:var(--oxblood);opacity:.5;margin:1.3em auto"
					></div>
				{:else}
					<div
						style="text-align:center;color:var(--oxblood);font-size:1.3em;margin:.7em 0 1em;opacity:.8"
					>
						{dividerGlyph(s.divider)}
					</div>
				{/if}
			{/if}
			<h2
				style="font-size:{compact
					? '1.18em'
					: '1.32em'};text-align:center;margin:0 0 .7em;color:var(--oxblood-deep);letter-spacing:.02em"
			>
				{b.text}
			</h2>
		{:else}
			<p class={s.dropcap && i === firstParaIdx ? 'ms-dropcap' : ''}>{b.text}</p>
		{/if}
	{/each}
</div>
