<script lang="ts">
	import { type AssetItem, assetName, dropcapBackground } from '$lib/manuscript';

	interface Props {
		label: string;
		description: string;
		current: string;
		items: AssetItem[];
		mode: 'paper' | 'wide' | 'vertical' | 'square';
		noAssetsLabel: string;
		onselect: (output: string) => void;
	}
	let { label, description, current, items, mode, noAssetsLabel, onselect }: Props = $props();

	const checker =
		'linear-gradient(45deg,#ead9ad 25%,#f6ebcc 25%,#f6ebcc 50%,#ead9ad 50%,#ead9ad 75%,#f6ebcc 75%)';
</script>

<section style="border-top:1px solid var(--line);padding-top:18px">
	<div
		style="display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end;justify-content:space-between;margin-bottom:12px"
	>
		<div>
			<h3 style="margin:0;font-family:var(--font-display);font-size:16px;color:var(--ink)">{label}</h3>
			<p style="margin:2px 0 0;font-size:13px;color:var(--ink-faint)">{description}</p>
		</div>
		<span style="font-size:12px;color:var(--ink-faint)">{assetName(items.find((i) => i.output === current))}</span>
	</div>

	{#if items.length}
		<div
			style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;max-height:260px;overflow:auto;padding-right:4px"
		>
			{#each items as item}
				{@const selected = current === item.output}
				<button
					type="button"
					onclick={() => onselect(item.output)}
					title={assetName(item)}
					style="padding:6px;border-radius:8px;cursor:pointer;text-align:left;background:var(--paper-edge);
						border:{selected ? '2px solid var(--oxblood)' : '1px solid var(--line-strong)'};
						box-shadow:{selected ? '0 0 0 3px rgba(124,34,48,.14)' : 'var(--shadow-sm)'}"
				>
					<span
						style="display:grid;place-items:center;height:84px;overflow:hidden;border-radius:5px;
							background:{mode === 'square'
							? dropcapBackground(item.output)
							: mode === 'paper'
								? 'var(--paper-deep)'
								: checker};
							background-size:{mode === 'paper' || mode === 'square' ? 'cover' : '16px 16px'}"
					>
						{#if mode === 'paper'}
							<span
								style="display:block;width:100%;height:100%;background-image:url({item.output});background-size:cover;background-position:center"
							></span>
						{:else}
							<img
								src={item.output}
								alt={assetName(item)}
								style="max-width:100%;max-height:100%;object-fit:contain;{mode === 'wide'
									? 'width:100%'
									: mode === 'vertical'
										? 'height:100%'
										: 'width:64px;height:64px;object-fit:cover'}"
							/>
						{/if}
					</span>
					<span
						style="display:block;margin-top:6px;font-size:11.5px;font-weight:600;color:var(--ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
						>{assetName(item)}</span
					>
				</button>
			{/each}
		</div>
	{:else}
		<div
			style="border:1px dashed var(--line-strong);background:var(--paper-edge);padding:16px;border-radius:8px;font-size:13px;color:var(--ink-faint)"
		>
			{noAssetsLabel}
		</div>
	{/if}
</section>
