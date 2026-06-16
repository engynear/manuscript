<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { shares, mediaUrl } from '$lib/api';
	import { DEFAULT_SETTINGS } from '$lib/settings';
	import type { Book, ManuscriptSettings, PublicShelf } from '$lib/types';
	import Monogram from '$lib/components/Monogram.svelte';
	import LangSwitch from '$lib/components/LangSwitch.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import BookSpine from '$lib/components/BookSpine.svelte';
	import BookCover from '$lib/components/BookCover.svelte';
	import ManuscriptPages from '$lib/components/ManuscriptPages.svelte';
	import BookSpread from '$lib/components/BookSpread.svelte';

	let data = $state<PublicShelf | null>(null);
	let error = $state('');
	let reading = $state<Book | null>(null);

	const readingSettings = $derived<ManuscriptSettings>({
		...DEFAULT_SETTINGS,
		...(reading?.settings ?? {}),
		chapterStart: 'newPage'
	});
	const readingMd = $derived(reading?.sourceMarkdown || `# ${reading?.title ?? ''}`);
	const readingPlan = $derived(reading?.plan ?? null);
	const readingImages = $derived(reading?.images ?? []);
	const readingBase = $derived<ManuscriptSettings>({ ...DEFAULT_SETTINGS, ...(reading?.settings ?? {}) });

	// ---- reading mode ----
	type Mode = 'spread' | 'single' | 'scroll';
	const STORE_KEY = 'mf:reader-mode';
	let mode = $state<Mode>('spread');
	let menuOpen = $state(false);

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

	function openReading(book: Book) {
		const saved = typeof localStorage !== 'undefined'
			? (localStorage.getItem(STORE_KEY) as Mode | null)
			: null;
		if (saved === 'spread' || saved === 'single' || saved === 'scroll') mode = saved;
		reading = book;
	}

	// ---- immersive fullscreen reading (single page + page-turn animation) ----
	let shellEl = $state<HTMLDivElement>();
	let immersive = $state(false);
	let prevMode = $state<Mode>('spread');

	async function enterImmersive() {
		prevMode = mode;
		setMode('single');
		immersive = true;
		try {
			await shellEl?.requestFullscreen?.();
		} catch {
			// Fullscreen can be refused (e.g. iOS Safari) — the fixed overlay still
			// gives an edge-to-edge reading surface.
		}
	}

	async function exitImmersive() {
		immersive = false;
		if (mode === 'single') setMode(prevMode);
		try {
			if (typeof document !== 'undefined' && document.fullscreenElement) await document.exitFullscreen();
		} catch {
			/* ignore */
		}
	}

	function toggleImmersive() {
		if (immersive) exitImmersive();
		else enterImmersive();
	}

	function onFsChange() {
		if (typeof document !== 'undefined' && !document.fullscreenElement && immersive) {
			immersive = false;
			if (mode === 'single') setMode(prevMode);
		}
	}

	onMount(async () => {
		document.addEventListener('fullscreenchange', onFsChange);
		try {
			data = await shares.public($page.params.token ?? '');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Not found';
		}
	});

	onMount(() => () => document.removeEventListener('fullscreenchange', onFsChange));
</script>

<div class="paper-grain" style="min-height:100vh">
	<header style="border-bottom:1px solid var(--line);background:var(--paper-card)">
		<div style="max-width:1200px;margin:0 auto;padding:16px 26px;display:flex;align-items:center;gap:14px">
			<a href="/" class="brand-link" aria-label="Manuscript Forge">
				<Monogram size={34} />
			</a>
			<div style="flex:1">
				<a href="/" class="brand-title">Manuscript Forge</a>
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
									<BookSpine {book} h={232} onclick={() => openReading(book)} />
									{#if data.allowDownloads && book.contentHash}
										<a
											class="shared-download"
											href={mediaUrl(`/media/generated/${book.contentHash}/manuscript.pdf`)}
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
		bind:this={shellEl}
		class="leather-surface"
		class:immersive
		style="position:fixed;inset:0;z-index:90;display:flex;flex-direction:column"
	>
		<div class="rd-topbar" style="position:relative;z-index:3;display:flex;align-items:center;gap:12px;padding:14px 22px">
			<button class="reader-btn" onclick={() => (reading = null)}>
				<Icon name="chevL" size={17} />{$t('back_shelf')}
			</button>
			<div style="flex:1"></div>
			<div style="text-align:center;color:#f0e2c8">
				<div style="font-family:var(--font-display);font-size:16px">{reading.title}</div>
				<div style="font-size:12px;opacity:.7">{reading.author}</div>
			</div>
			<div style="flex:1;display:flex;justify-content:flex-end;gap:10px">
				{#if data?.allowDownloads && reading.contentHash}
					<a class="reader-btn" href={mediaUrl(`/media/generated/${reading.contentHash}/manuscript.pdf`)} download>
						<Icon name="download" size={17} />{$t('download')}
					</a>
				{/if}
				<button
					class="reader-btn"
					aria-label={$t('immersive')}
					title={$t('immersive')}
					onclick={toggleImmersive}
				>
					<Icon name="expand" size={17} />
				</button>
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
				<div class="mf-fade-up" style="padding:20px 0">
					<div class="scroll-cover">
						<BookCover book={reading} w={540} />
					</div>
					<ManuscriptPages md={readingMd} plan={readingPlan} images={readingImages} settings={readingSettings} width={540} />
				</div>
			</div>
		{:else}
			<div
				class="rd-stage-wrap"
				style="position:relative;z-index:1;flex:1;min-height:0;overflow:hidden;display:grid;place-items:center;padding:0 16px 18px"
			>
				<div class="mf-fade-up" style="width:100%;height:100%">
					{#key mode}
						<BookSpread md={readingMd} plan={readingPlan} images={readingImages} settings={readingBase} {mode} book={reading} {immersive} />
					{/key}
				</div>
			</div>
		{/if}

		{#if immersive}
			<button class="rd-exit" aria-label={$t('exit_immersive')} title={$t('exit_immersive')} onclick={exitImmersive}>
				<Icon name="compress" size={18} />
			</button>
		{/if}
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
	.rd-menu { position: relative; }
	/* immersive fullscreen: hide chrome, page reaches the 10px side margins */
	.immersive .rd-topbar {
		display: none !important;
	}
	.immersive .rd-stage-wrap {
		padding: 0 !important;
	}
	.rd-exit {
		position: fixed;
		top: max(12px, env(safe-area-inset-top));
		right: max(12px, env(safe-area-inset-right));
		z-index: 20;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		border: 1px solid rgba(240, 226, 200, 0.18);
		background: rgba(28, 16, 6, 0.42);
		color: #f0e2c8;
		cursor: pointer;
		backdrop-filter: blur(3px);
		opacity: 0.5;
		transition:
			opacity 0.2s ease,
			background 0.18s ease,
			transform 0.12s ease;
	}
	.rd-exit:hover,
	.rd-exit:focus-visible {
		opacity: 1;
		background: rgba(28, 16, 6, 0.6);
	}
	.rd-exit:active {
		transform: scale(0.92);
	}
	.brand-link,
	.brand-title {
		color: inherit;
		text-decoration: none;
	}
	.brand-link {
		display: grid;
		place-items: center;
		border-radius: 8px;
	}
	.brand-title {
		display: inline-block;
		font-family: var(--font-display);
		font-size: 15px;
		font-weight: 700;
	}
	.brand-link:focus-visible,
	.brand-title:focus-visible {
		outline: 2px solid var(--gilt);
		outline-offset: 3px;
	}
	.scroll-cover {
		display: grid;
		place-items: center;
		margin: 0 auto 32px;
		width: min(100%, 540px);
		padding: 34px 0;
	}
	.rd-scrim {
		position: fixed; inset: 0; z-index: 9;
		border: none; background: transparent; cursor: default;
	}
	.rd-pop {
		position: absolute; top: calc(100% + 8px); right: 0; z-index: 10;
		width: 232px; padding: 8px; border-radius: 12px;
		background: color-mix(in srgb, var(--leather-dark) 85%, black);
		border: 1px solid rgba(240, 226, 200, 0.14);
		box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4);
		animation: rd-pop-in 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes rd-pop-in {
		from { opacity: 0; transform: translateY(-6px) scale(0.97); }
		to { opacity: 1; transform: none; }
	}
	.rd-pop-title {
		padding: 4px 8px 8px;
		font-family: var(--font-chrome); font-size: 11px;
		letter-spacing: 0.08em; text-transform: uppercase;
		color: rgba(240, 226, 200, 0.5);
	}
	.rd-opt {
		display: flex; align-items: center; gap: 10px;
		width: 100%; padding: 9px 10px; border: none; border-radius: 8px;
		background: none; color: #f0e2c8;
		font-family: var(--font-chrome); font-size: 14px;
		cursor: pointer; transition: background 0.16s ease;
	}
	.rd-opt:hover { background: rgba(240, 226, 200, 0.08); }
	.rd-opt:focus-visible { outline: 2px solid var(--gilt); outline-offset: -2px; }
	.rd-opt.active { background: rgba(201, 164, 76, 0.16); color: #f3e6c4; }
	@media (prefers-reduced-motion: reduce) {
		.rd-pop { animation: none; }
		.rd-opt { transition: none; }
	}
</style>
