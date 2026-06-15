<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { books as booksApi } from '$lib/api';
	import { DEFAULT_SETTINGS } from '$lib/settings';
	import type { Book, ManuscriptSettings } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import ManuscriptPages from '$lib/components/ManuscriptPages.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');
	let ready = $state(false);

	const settings = $derived<ManuscriptSettings>({ ...DEFAULT_SETTINGS, ...(book?.settings ?? {}) });
	const md = $derived(book?.sourceMarkdown || `# ${book?.title ?? ''}`);
	const plan = $derived(book?.plan ?? null);
	const images = $derived(book?.images ?? []);
	const pageCss = $derived((settings.pageSize ?? 'a4') === 'letter' ? 'letter' : 'A4');

	let sheet = $state<HTMLDivElement>();

	/** Wait until fonts are loaded, pages have laid out, and every image decoded. */
	async function waitForRender() {
		if (typeof document !== 'undefined' && document.fonts?.ready) {
			await document.fonts.ready;
		}
		// Let ManuscriptPages run its pagination effect.
		await new Promise((r) => setTimeout(r, 120));
		const imgs = Array.from(sheet?.querySelectorAll('img') ?? []);
		await Promise.all(
			imgs.map((img) =>
				img.complete ? Promise.resolve() : img.decode().catch(() => undefined)
			)
		);
		ready = true;
	}

	function doPrint() {
		window.print();
	}

	onMount(async () => {
		try {
			book = await booksApi.get($page.params.id ?? '');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Not found';
			return;
		}
		// Set the printed page size dynamically via an injected style element
		// (a dynamic value cannot live in a static component stylesheet).
		const styleEl = document.createElement('style');
		styleEl.textContent = `@media print { @page { size: ${pageCss}; margin: 0; } }`;
		document.head.appendChild(styleEl);

		window.onafterprint = () => {
			window.onafterprint = null;
			if (window.history.length > 1) history.back();
		};
		await waitForRender();
		// Auto-open the print dialog once everything is rendered.
		requestAnimationFrame(doPrint);
	});
</script>

<svelte:head>
	<title>{book ? `${book.title} — PDF` : 'PDF'}</title>
</svelte:head>

<!-- screen-only toolbar; hidden when printing -->
<div class="bar no-print">
	<button class="reader-btn" onclick={() => (window.history.length > 1 ? history.back() : window.close())}>
		<Icon name="chevL" size={16} />{$t('nav_library')}
	</button>
	<div style="flex:1"></div>
	<div class="hint">{ready ? $t('print_hint') : $t('print_preparing')}</div>
	<button class="reader-btn primary" onclick={doPrint} disabled={!ready}>
		<Icon name="download" size={16} />{$t('download')}
	</button>
</div>

<div class="sheet-wrap" bind:this={sheet}>
	{#if error}
		<div class="err">{error}</div>
	{:else if book}
		<ManuscriptPages {md} {plan} {images} {settings} print />
	{/if}
</div>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 20px;
		background: color-mix(in srgb, var(--leather-dark, #2a1c12) 92%, black);
		color: #f0e2c8;
		border-bottom: 1px solid rgba(240, 226, 200, 0.12);
	}
	.hint {
		font-size: 13px;
		opacity: 0.7;
	}
	.reader-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: 8px;
		border: 1px solid rgba(240, 226, 200, 0.18);
		background: rgba(28, 16, 6, 0.3);
		color: #f0e2c8;
		font-family: var(--font-chrome);
		font-size: 14px;
		cursor: pointer;
	}
	.reader-btn.primary {
		background: var(--gilt, #c9a44c);
		color: #2a1c12;
		border-color: transparent;
		font-weight: 700;
	}
	.reader-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.sheet-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		padding: 28px 16px 60px;
		background: #2a1c12;
		min-height: 100vh;
	}
	.err {
		color: #f0e2c8;
		margin-top: 60px;
	}
	@media print {
		.no-print {
			display: none !important;
		}
		.sheet-wrap {
			padding: 0;
			gap: 0;
			background: white;
			min-height: 0;
		}
	}
</style>
