<script lang="ts">
	import { t } from '$lib/i18n';
	import Monogram from '$lib/components/Monogram.svelte';
	import LangSwitch from '$lib/components/LangSwitch.svelte';
	import Placeholder from '$lib/components/Placeholder.svelte';
</script>

<div class="paper-grain" style="min-height:100vh">
	<header style="border-bottom:1px solid var(--line);background:var(--paper-card)">
		<div
			style="max-width:1200px;margin:0 auto;padding:16px 26px;display:flex;align-items:center;gap:14px"
		>
			<Monogram size={34} />
			<div style="flex:1">
				<div style="font-family:var(--font-display);font-size:15px;font-weight:700">Manuscript Forge</div>
				<div style="font-size:12.5px;color:var(--ink-faint)">{$t('shared_by')}</div>
			</div>
			<span class="mf-chip" style="color:var(--gilt);border-color:var(--gilt)">{$t('read_only')}</span>
			<LangSwitch />
		</div>
	</header>
	<Placeholder title={$t('shared_status_on')} sub={$t('share_sub')} icon="shelves" />
</div>
