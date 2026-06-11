<script lang="ts">
	import Icon from './Icon.svelte';
	let { title, sub = '', icon = 'forge' }: { title: string; sub?: string; icon?: string } = $props();
</script>

<div style="max-width:1320px;margin:0 auto;padding:60px 26px;text-align:center">
	<div
		style="width:64px;height:64px;margin:0 auto 18px;border-radius:14px;display:grid;place-items:center;background:var(--paper-card);border:1px solid var(--line);color:var(--gilt)"
	>
		<Icon name={icon} size={28} />
	</div>
	<h1 style="font-family:var(--font-display);font-size:28px;margin:0 0 8px">{title}</h1>
	{#if sub}<div style="color:var(--ink-faint);max-width:460px;margin:0 auto">{sub}</div>{/if}
</div>
