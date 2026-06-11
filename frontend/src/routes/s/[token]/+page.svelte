<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { shares } from '$lib/api';
	import { DEFAULT_SETTINGS } from '$lib/settings';
	import type { Book, ManuscriptSettings, PublicShelf } from '$lib/types';
	import Monogram from '$lib/components/Monogram.svelte';
	import LangSwitch from '$lib/components/LangSwitch.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import BookSpine from '$lib/components/BookSpine.svelte';
	import ManuscriptPages from '$lib/components/ManuscriptPages.svelte';

	let data = $state<PublicShelf | null>(null);
	let error = $state('');
	let reading = $state<Book | null>(null);

	const readingSettings = $derived<ManuscriptSettings>({
		...DEFAULT_SETTINGS,
		...(reading?.settings ?? {})
	});

	onMount(async () => {
		try {
			data = await shares.public($page.params.token ?? '');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Not found';
		}
	});
</script>

<div class="paper-grain" style="min-height:100vh">
	<header style="border-bottom:1px solid var(--line);background:var(--paper-card)">
		<div style="max-width:1200px;margin:0 auto;padding:16px 26px;display:flex;align-items:center;gap:14px">
			<Monogram size={34} />
			<div style="flex:1">
				<div style="font-family:var(--font-display);font-size:15px;font-weight:700">Manuscript Forge</div>
				<div style="font-size:12.5px;color:var(--ink-faint)">{$t('shared_by')} {data?.ownerName ?? ''}</div>
			</div>
			<span class="mf-chip" style="color:var(--gilt);border-color:var(--gilt)">{$t('read_only')}</span>
			<LangSwitch />
		</div>
	</header>

	<div style="max-width:1200px;margin:0 auto;padding:36px 26px 70px">
		{#if error}
			<div style="text-align:center;padding:60px;color:var(--oxblood)">{error}</div>
		{:else if data}
			<div style="text-align:center;margin-bottom:34px">
				<div class="eyebrow">{$t('shared_by')} {data.ownerName}</div>
				<h1 style="font-family:var(--font-display);font-size:34px;margin:8px 0 0">{data.shelf.name}</h1>
			</div>

			<div style="position:relative">
				<div class="leather-surface" style="border-radius:8px 8px 0 0;padding:20px 22px 0;overflow-x:auto">
					{#if data.books.length === 0}
						<div style="min-height:160px;display:grid;place-items:center;color:rgba(245,236,214,.78)">{$t('empty_shelf')}</div>
					{:else}
						<div style="display:flex;align-items:flex-end;gap:5px;min-height:232px;padding-bottom:2px">
							{#each data.books as book (book.id)}
								<BookSpine {book} h={232} onclick={() => (reading = book)} />
							{/each}
						</div>
					{/if}
				</div>
				<div class="wood-surface" style="height:var(--shelf-wood-h);border-radius:0 0 4px 4px"></div>
			</div>

			{#if data.allowDownloads}
				<div style="text-align:center;margin-top:30px">
					<button class="mf-btn"><Icon name="download" size={16} />{$t('shared_dl')}</button>
				</div>
			{/if}
		{/if}
	</div>
</div>

{#if reading}
	<div
		onmousedown={() => (reading = null)}
		role="presentation"
		class="leather-surface"
		style="position:fixed;inset:0;z-index:90;display:flex;flex-direction:column"
	>
		<div style="display:flex;align-items:center;gap:12px;padding:14px 22px">
			<button class="reader-btn" onclick={() => (reading = null)}><Icon name="close" size={17} />{$t('back_shelf')}</button>
			<div style="flex:1"></div>
			<div style="text-align:center;color:#f0e2c8">
				<div style="font-family:var(--font-display);font-size:16px">{reading.title}</div>
				<div style="font-size:12px;opacity:.7">{reading.author}</div>
			</div>
			<div style="flex:1"></div>
		</div>
		<div
			onmousedown={(e) => e.stopPropagation()}
			role="presentation"
			style="flex:1;overflow:auto;display:grid;place-items:start center;padding:0 16px 40px"
		>
			<div class="mf-fade-up" style="padding:20px 0">
				<ManuscriptPages md={reading.sourceMarkdown || `# ${reading.title}`} settings={readingSettings} width={520} />
			</div>
		</div>
	</div>
{/if}
