<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { books as booksApi, mediaUrl } from '$lib/api';
	import { DEFAULT_SETTINGS } from '$lib/settings';
	import type { Book, ManuscriptSettings } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import BookCover from '$lib/components/BookCover.svelte';
	import BookSpread from '$lib/components/BookSpread.svelte';
	import ManuscriptPages from '$lib/components/ManuscriptPages.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');

	const settings = $derived<ManuscriptSettings>({ ...DEFAULT_SETTINGS, ...(book?.settings ?? {}) });
	// The reader is Model B: every mode breaks at each h1/h2 (chapter-per-page),
	// independent of the print page-break setting. Scroll mode reuses the paginated
	// renderer, so force the chapter break here too for a consistent reading model.
	const readerSettings = $derived<ManuscriptSettings>({ ...settings, chapterStart: 'newPage' });
	// Where "back" returns to: the page the reader was opened from (e.g. a shelf),
	// falling back to the library when opened without a `from` hint.
	const backTo = $derived($page.url.searchParams.get('from') || '/library');
	const backLabel = $derived(backTo.startsWith('/shelves') ? $t('nav_shelves') : $t('nav_library'));
	const md = $derived(book?.sourceMarkdown || `# ${book?.title ?? ''}`);
	const plan = $derived(book?.plan ?? null);
	const images = $derived(book?.images ?? []);

	// ---- reading mode (persisted) ----
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

	// ---- immersive fullscreen reading (single page + page-turn animation) ----
	let shellEl = $state<HTMLDivElement>();
	let immersive = $state(false);
	let prevMode = $state<Mode>('spread');

	async function enterImmersive() {
		prevMode = mode;
		// Fullscreen reads best one page at a time; the flip animation is preserved.
		setMode('single');
		immersive = true;
		try {
			await shellEl?.requestFullscreen?.();
		} catch {
			// Fullscreen can be refused (e.g. iOS Safari) — the CSS fixed overlay
			// still gives an edge-to-edge immersive reading surface.
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
		// Sync when the user leaves fullscreen via the system (Esc / gesture).
		if (typeof document !== 'undefined' && !document.fullscreenElement && immersive) {
			immersive = false;
			if (mode === 'single') setMode(prevMode);
		}
	}

	onMount(() => {
		document.addEventListener('fullscreenchange', onFsChange);
		return () => document.removeEventListener('fullscreenchange', onFsChange);
	});

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

<div
	bind:this={shellEl}
	class="leather-surface"
	class:immersive
	style="position:fixed;inset:0;display:flex;flex-direction:column"
>
	<div class="rd-topbar" style="position:relative;z-index:3;display:flex;align-items:center;gap:12px;padding:14px 22px">
		<button class="reader-btn" onclick={() => goto(backTo)}>
			<Icon name="chevL" size={17} />{backLabel}
		</button>
		<div style="flex:1"></div>
		<div style="text-align:center;color:#f0e2c8">
			<div style="font-family:var(--font-display);font-size:16px">{book?.title ?? ''}</div>
			<div style="font-size:12px;opacity:.7">{book?.author ?? ''}</div>
		</div>
		<div style="flex:1;display:flex;justify-content:flex-end;align-items:center;gap:10px">
			{#if book?.contentHash}
				<a class="reader-btn" href={mediaUrl(`/media/generated/${book.contentHash}/manuscript.pdf`)} download>
					<Icon name="download" size={17} />{$t('redownload')}
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
			{#if error}
				<div style="color:#f0e2c8;margin-top:60px">{error}</div>
			{:else if book}
				<div class="mf-fade-up" style="padding:20px 0">
					<div class="scroll-cover">
						<BookCover {book} w={540} />
					</div>
					<ManuscriptPages {md} {plan} {images} settings={readerSettings} width={540} />
				</div>
			{/if}
		</div>
	{:else}
		<div
			class="rd-stage-wrap"
			style="position:relative;z-index:1;flex:1;min-height:0;overflow:hidden;display:grid;place-items:center;padding:0 16px 18px"
		>
			{#if error}
				<div style="color:#f0e2c8">{error}</div>
			{:else if book}
				<div class="mf-fade-up" style="width:100%;height:100%">
					{#key mode}
						<BookSpread {md} {plan} {images} {settings} {mode} {book} {immersive} />
					{/key}
				</div>
			{/if}
		</div>
	{/if}

	{#if immersive}
		<button class="rd-exit" aria-label={$t('exit_immersive')} title={$t('exit_immersive')} onclick={exitImmersive}>
			<Icon name="compress" size={18} />
		</button>
	{/if}
</div>

<style>
	/* immersive fullscreen: hide app chrome, give the page edge-to-edge room */
	.immersive .rd-topbar {
		/* override the element's inline display:flex */
		display: none !important;
	}
	/* let the page reach the 10px side margins in fullscreen */
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
	.scroll-cover {
		display: grid;
		place-items: center;
		margin: 0 auto 32px;
		width: min(100%, 540px);
		padding: 34px 0;
	}
</style>
