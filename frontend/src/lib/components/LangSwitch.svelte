<script lang="ts">
	import { lang } from '$lib/i18n';
	import Icon from './Icon.svelte';
	const langs: Array<'en' | 'ru'> = ['en', 'ru'];
</script>

<div
	role="group"
	aria-label="Language"
	style="display:flex;align-items:center;gap:2px;padding:3px;border-radius:100px;border:1px solid var(--line-strong);background:rgba(255,255,255,.4)"
>
	<Icon name="globe" size={15} style="margin:0 4px 0 6px;color:var(--ink-faint)" />
	{#each langs as l}
		<button
			onclick={() => lang.set(l)}
			aria-pressed={$lang === l}
			style="border:none;border-radius:100px;padding:4px 11px;font-size:13px;font-weight:600;
				letter-spacing:.04em;text-transform:uppercase;cursor:pointer;
				background:{$lang === l ? 'var(--ink)' : 'transparent'};
				color:{$lang === l ? 'var(--paper-card)' : 'var(--ink-soft)'}"
		>
			{l}
		</button>
	{/each}
</div>
