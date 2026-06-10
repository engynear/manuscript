<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import Icon from '$lib/components/Icon.svelte';
</script>

<div
	class="leather-surface"
	style="position:fixed;inset:0;display:grid;place-items:center;color:#f0e2c8;text-align:center"
>
	<div>
		<h1 style="font-family:var(--font-display);font-size:28px;margin:0 0 16px">{$t('read')}</h1>
		<button class="reader-btn" onclick={() => goto('/shelves')}>
			<Icon name="chevL" size={17} />{$t('back_shelf')}
		</button>
	</div>
</div>
