<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { books as booksApi } from '$lib/api';
	import { DEFAULT_SETTINGS } from '$lib/settings';
	import type { Book, ManuscriptSettings } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import ManuscriptPages from '$lib/components/ManuscriptPages.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');

	const settings = $derived<ManuscriptSettings>({ ...DEFAULT_SETTINGS, ...(book?.settings ?? {}) });
	const md = $derived(book?.sourceMarkdown || `# ${book?.title ?? ''}`);

	onMount(async () => {
		try {
			book = await booksApi.get($page.params.id ?? '');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Not found';
		}
	});
</script>

<div class="leather-surface" style="position:fixed;inset:0;display:flex;flex-direction:column">
	<div style="position:relative;z-index:2;display:flex;align-items:center;gap:12px;padding:14px 22px">
		<button class="reader-btn" onclick={() => goto('/library')}><Icon name="chevL" size={17} />{$t('nav_library')}</button>
		<div style="flex:1"></div>
		<div style="text-align:center;color:#f0e2c8">
			<div style="font-family:var(--font-display);font-size:16px">{book?.title ?? ''}</div>
			<div style="font-size:12px;opacity:.7">{book?.author ?? ''}</div>
		</div>
		<div style="flex:1"></div>
	</div>

	<div style="position:relative;z-index:1;flex:1;overflow:auto;display:grid;place-items:start center;padding:0 16px 40px">
		{#if error}
			<div style="color:#f0e2c8;margin-top:60px">{error}</div>
		{:else if book}
			<div class="mf-fade-up" style="padding:20px 0">
				<ManuscriptPages {md} {settings} width={520} />
			</div>
		{/if}
	</div>
</div>
