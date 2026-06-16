<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { books as booksApi } from '$lib/api';
	import { DEFAULT_SETTINGS } from '$lib/settings';
	import type { Book, ManuscriptSettings } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import BookSpread from '$lib/components/BookSpread.svelte';
	import ManuscriptPages from '$lib/components/ManuscriptPages.svelte';
	import BookCover from '$lib/components/BookCover.svelte';
	import BookSpine from '$lib/components/BookSpine.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');

	const settings = $derived<ManuscriptSettings>({ ...DEFAULT_SETTINGS, ...(book?.settings ?? {}) });
	const md = $derived(book?.sourceMarkdown || `# ${book?.title ?? ''}`);

	// ---- reading mode (persisted) ----
	type Mode = 'spread' | 'single' | 'scroll';
	const STORE_KEY = 'mf:reader-mode';
	let mode = $state<Mode>('spread');
	let menuOpen = $state(false);
	let coverOpen = $state(false);

	const modeOptions: { value: Mode; key: string; icon: 'contents' | 'read' | 'sort' }[] = [
		{ value: 'spread', key: 'spread', icon: 'read' },
		{ value: 'single', key: 'single', icon: 'contents' },
		{ value: 'scroll', key: 'scroll', icon: 'sort' }
	];

	function setMode(m: Mode) {
		mode = m;
		menuOpen = false;
		if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, m);
	}

	onMount(async () => {
		const saved = localStorage.getItem(STORE_KEY) as Mode | null;
		if (saved === 'spread' || saved === 'single' || saved === 'scroll') mode = saved;
		try {
			book = await booksApi.get($page.params.id ?? '');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Not found';
		}
	});
</script>

<div class="leather-surface" style="position:fixed;inset:0;display:flex;flex-direction:column">
	<div style="position:relative;z-index:3;display:flex;align-items:center;gap:12px;padding:14px 22px">
		<button class="reader-btn" onclick={() => goto('/library')}>
			<Icon name="chevL" size={17} />{$t('nav_library')}
		</button>
		{#if book}
			<button class="cover-chip" aria-label={$t('edit_cover')} onclick={() => (coverOpen = true)}>
				<BookCover {book} w={42} title={false} />
			</button>
		{/if}
		<div style="flex:1"></div>
		<div style="text-align:center;color:#f0e2c8">
			<div style="font-family:var(--font-display);font-size:16px">{book?.title ?? ''}</div>
			<div style="font-size:12px;opacity:.7">{book?.author ?? ''}</div>
		</div>
		<div style="flex:1;display:flex;justify-content:flex-end;align-items:center;gap:10px">
			{#if book?.contentHash}
				<a class="reader-btn" href={`/media/generated/${book.contentHash}/manuscript.pdf`} download>
					<Icon name="download" size={17} />{$t('redownload')}
				</a>
			{/if}
			<div class="rd-menu">
				<button
					class="reader-btn"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-label={$t('reader_mode')}
					onclick={() => (menuOpen = !menuOpen)}
				>
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
								onclick={() => setMode(o.value)}
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

	{#if mode === 'scroll'}
		<div
			style="position:relative;z-index:1;flex:1;min-height:0;overflow:auto;display:grid;place-items:start center;padding:0 16px 48px"
		>
			{#if error}
				<div style="color:#f0e2c8;margin-top:60px">{error}</div>
			{:else if book}
				<div class="mf-fade-up" style="padding:20px 0">
					<ManuscriptPages {md} {settings} width={540} />
				</div>
			{/if}
		</div>
	{:else}
		<div
			style="position:relative;z-index:1;flex:1;min-height:0;overflow:hidden;display:grid;place-items:center;padding:0 16px 18px"
		>
			{#if error}
				<div style="color:#f0e2c8">{error}</div>
			{:else if book}
				<div class="mf-fade-up" style="width:100%;height:100%">
					{#key mode}
						<BookSpread {md} {settings} {mode} />
					{/key}
				</div>
			{/if}
		</div>
	{/if}

	{#if coverOpen && book}
		<button class="cover-scrim" aria-label="Close cover" onclick={() => (coverOpen = false)}></button>
		<div class="cover-modal" role="dialog" aria-modal="true" aria-label={book.title}>
			<button class="reader-btn cover-close" onclick={() => (coverOpen = false)}>
				<Icon name="close" size={17} />
			</button>
			<div class="cover-display">
				<BookSpine {book} h={420} />
				<BookCover {book} w={280} />
			</div>
			<div class="cover-title">
				<strong>{book.title}</strong>
				<span>{book.author}</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.cover-chip {
		display: grid;
		place-items: center;
		width: 42px;
		height: 56px;
		padding: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		transition: transform 0.16s ease;
	}
	.cover-chip:hover {
		transform: translateY(-2px);
	}
	.cover-scrim {
		position: fixed;
		inset: 0;
		z-index: 20;
		border: none;
		background: rgba(16, 9, 4, 0.62);
		backdrop-filter: blur(3px);
	}
	.cover-modal {
		position: fixed;
		z-index: 21;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: grid;
		justify-items: center;
		gap: 18px;
		padding: 24px 28px 22px;
		border: 1px solid rgba(240, 226, 200, 0.16);
		border-radius: 12px;
		background: color-mix(in srgb, var(--leather-dark) 88%, black);
		box-shadow: 0 28px 70px rgba(0, 0, 0, 0.52);
	}
	.cover-close {
		position: absolute;
		right: 12px;
		top: 12px;
	}
	.cover-display {
		display: flex;
		align-items: flex-end;
		margin-top: 22px;
		filter: drop-shadow(0 20px 24px rgba(0, 0, 0, 0.28));
	}
	.cover-title {
		display: grid;
		gap: 4px;
		text-align: center;
		color: #f0e2c8;
	}
	.cover-title strong {
		font-family: var(--font-display);
		font-size: 18px;
	}
	.cover-title span {
		font-size: 13px;
		opacity: 0.7;
	}
	.rd-menu {
		position: relative;
	}
	.rd-scrim {
		position: fixed;
		inset: 0;
		z-index: 9;
		border: none;
		background: transparent;
		cursor: default;
	}
	.rd-pop {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 10;
		width: 232px;
		padding: 8px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--leather-dark) 85%, black);
		border: 1px solid rgba(240, 226, 200, 0.14);
		box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4);
		animation: rd-pop-in 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes rd-pop-in {
		from {
			opacity: 0;
			transform: translateY(-6px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: none;
		}
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
		transition: background 0.16s ease;
	}
	.rd-opt:hover {
		background: rgba(240, 226, 200, 0.08);
	}
	.rd-opt:focus-visible {
		outline: 2px solid var(--gilt);
		outline-offset: -2px;
	}
	.rd-opt.active {
		background: rgba(201, 164, 76, 0.16);
		color: #f3e6c4;
	}
	@media (prefers-reduced-motion: reduce) {
		.rd-pop {
			animation: none;
		}
		.rd-opt {
			transition: none;
		}
	}
</style>
