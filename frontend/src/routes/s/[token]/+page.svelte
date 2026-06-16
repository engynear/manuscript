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
	import CanonicalManuscriptReader from '$lib/components/CanonicalManuscriptReader.svelte';

	let data = $state<PublicShelf | null>(null);
	let error = $state('');
	let reading = $state<Book | null>(null);
	type Mode = 'spread' | 'single' | 'scroll';
	let mode = $state<Mode>('spread');
	let menuOpen = $state(false);

	const modeOptions: { value: Mode; key: string; icon: 'contents' | 'read' | 'sort' }[] = [
		{ value: 'spread', key: 'spread', icon: 'read' },
		{ value: 'single', key: 'single', icon: 'contents' },
		{ value: 'scroll', key: 'scroll', icon: 'sort' }
	];

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
								<div class="shared-book">
									<BookSpine {book} h={232} onclick={() => (reading = book)} />
									{#if data.allowDownloads && book.contentHash}
										<a
											class="shared-download"
											href={`/media/generated/${book.contentHash}/manuscript.pdf`}
											download
											title={$t('download')}
											onclick={(e) => e.stopPropagation()}
										>
											<Icon name="download" size={15} />
										</a>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
				<div class="wood-surface" style="height:var(--shelf-wood-h);border-radius:0 0 4px 4px"></div>
			</div>
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
		<div onmousedown={(e) => e.stopPropagation()} role="presentation" style="display:flex;align-items:center;gap:12px;padding:14px 22px">
			<button class="reader-btn" onclick={() => (reading = null)}><Icon name="close" size={17} />{$t('back_shelf')}</button>
			<div style="flex:1"></div>
			<div style="text-align:center;color:#f0e2c8">
				<div style="font-family:var(--font-display);font-size:16px">{reading.title}</div>
				<div style="font-size:12px;opacity:.7">{reading.author}</div>
			</div>
			<div style="flex:1;display:flex;justify-content:flex-end">
				{#if data?.allowDownloads && reading.contentHash}
					<a class="reader-btn" href={`/media/generated/${reading.contentHash}/manuscript.pdf`} download>
						<Icon name="download" size={17} />{$t('download')}
					</a>
				{/if}
				<div class="rd-menu">
					<button class="reader-btn" aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
						<Icon name={modeOptions.find((o) => o.value === mode)?.icon ?? 'read'} size={17} />
					</button>
					{#if menuOpen}
						<button class="rd-scrim" aria-label="Close menu" onclick={() => (menuOpen = false)}></button>
						<div class="rd-pop" role="menu">
							<div class="rd-pop-title">{$t('reader_mode')}</div>
							{#each modeOptions as o}
								<button
									class="rd-opt"
									class:active={mode === o.value}
									role="menuitemradio"
									aria-checked={mode === o.value}
									onclick={() => {
										mode = o.value;
										menuOpen = false;
									}}
								>
									<Icon name={o.icon} size={16} />
									<span style="flex:1;text-align:left">{$t(o.key)}</span>
									{#if mode === o.value}<Icon name="check" size={16} />{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
		<div
			onmousedown={(e) => e.stopPropagation()}
			role="presentation"
			style="flex:1;min-height:0;overflow:{mode === 'scroll' ? 'auto' : 'hidden'};display:grid;place-items:{mode === 'scroll'
				? 'start center'
				: 'center'};padding:0 16px 40px"
		>
			<div class="mf-fade-up" style="width:100%;height:{mode === 'scroll' ? 'auto' : '100%'};padding:{mode === 'scroll' ? '20px 0' : '0'}">
				{#if reading.contentHash}
					<CanonicalManuscriptReader book={reading} {mode} />
				{:else}
					<ManuscriptPages md={reading.sourceMarkdown || `# ${reading.title}`} settings={readingSettings} width={520} />
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.shared-book {
		position: relative;
		flex: 0 0 auto;
	}
	.shared-download {
		position: absolute;
		left: 50%;
		bottom: 18px;
		transform: translate(-50%, 8px);
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(250, 245, 234, 0.94);
		color: var(--oxblood);
		box-shadow: var(--shadow-md);
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 0.16s ease,
			transform 0.16s ease;
	}
	.shared-book:hover .shared-download,
	.shared-book:focus-within .shared-download {
		opacity: 1;
		transform: translate(-50%, 0);
		pointer-events: auto;
	}
	.rd-menu {
		position: relative;
		margin-left: 10px;
	}
	.rd-scrim {
		position: fixed;
		inset: 0;
		z-index: 91;
		border: none;
		background: transparent;
		cursor: default;
	}
	.rd-pop {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 92;
		width: 232px;
		padding: 8px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--leather-dark) 85%, black);
		border: 1px solid rgba(240, 226, 200, 0.14);
		box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4);
	}
	.rd-pop-title {
		padding: 4px 8px 8px;
		font-family: var(--font-chrome);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: rgba(240, 226, 200, 0.5);
	}
	.rd-opt {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		border: none;
		border-radius: 8px;
		background: none;
		color: #f0e2c8;
		font-family: var(--font-chrome);
		font-size: 14px;
		cursor: pointer;
	}
	.rd-opt:hover,
	.rd-opt.active {
		background: rgba(201, 164, 76, 0.16);
	}
</style>
