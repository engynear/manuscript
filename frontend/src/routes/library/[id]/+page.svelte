<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { books as booksApi, currentUser, auth } from '$lib/api';
	import { PALETTES, paletteFor } from '$lib/covers';
	import type { Book, Palette } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import BookCover from '$lib/components/BookCover.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');
	let saving = $state(false);
	let savedFlash = $state(false);

	// editable fields
	let title = $state('');
	let author = $state('');
	let subtitle = $state('');
	let spineText = $state('');
	let palette = $state<Palette>(PALETTES[0]);

	// live preview book derived from the draft
	const preview = $derived<Book>({
		...(book as Book),
		title: title || $t('untitled'),
		author,
		cover: { palette, spineText, artUrl: book?.cover?.artUrl ?? null }
	});

	function load(b: Book) {
		book = b;
		title = b.title;
		author = b.author;
		subtitle = b.subtitle ?? '';
		spineText = b.cover?.spineText ?? '';
		palette = b.cover?.palette ?? paletteFor(b);
	}

	async function save() {
		if (!book) return;
		saving = true;
		error = '';
		try {
			const updated = await booksApi.update(book.id, {
				title: title.trim() || 'Untitled',
				titleRu: book.titleRu ?? '',
				author: author.trim(),
				subtitle: subtitle.trim(),
				year: book.year ?? null,
				settings: book.settings,
				cover: { palette, spineText: spineText.trim(), artUrl: book.cover?.artUrl ?? null },
				sourceMarkdown: book.sourceMarkdown ?? '',
				pageCount: book.pageCount
			});
			load(updated);
			savedFlash = true;
			setTimeout(() => (savedFlash = false), 1600);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save';
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!book || !confirm($t('delete_book_confirm'))) return;
		await booksApi.remove(book.id);
		goto('/library');
	}

	onMount(async () => {
		const user = $currentUser ?? (await auth.me());
		if (!user) {
			goto('/signin');
			return;
		}
		try {
			load(await booksApi.get($page.params.id ?? ''));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Not found';
		}
	});
</script>

<div class="wrap">
	<button class="mf-btn mf-btn--ghost back" onclick={() => goto('/library')}>
		<Icon name="chevL" size={16} />{$t('nav_library')}
	</button>

	{#if error && !book}
		<div class="err-box">{error}</div>
	{:else if book}
		<div class="grid">
			<!-- live cover -->
			<aside class="stage rise" style="--d:60ms">
				<div class="cover-float">
					<div class="cover-shadow"></div>
					<BookCover book={preview} w={260} />
				</div>
				<div class="actions">
					<button class="mf-btn mf-btn--primary" onclick={() => book && goto(`/reader/${book.id}`)}>
						<Icon name="read" size={16} />{$t('read')}
					</button>
				</div>
			</aside>

			<!-- editor -->
			<section class="panel rise" style="--d:0ms">
				<div class="eyebrow">{$t('edit_book')}</div>
				<h1 class="h">{$t('book_details')}</h1>

				<label class="f">
					<span class="lbl">{$t('f_title')}</span>
					<input bind:value={title} placeholder={$t('untitled')} />
				</label>
				<label class="f">
					<span class="lbl">{$t('f_author')}</span>
					<input bind:value={author} placeholder={$t('anon')} />
				</label>
				<label class="f">
					<span class="lbl">{$t('f_subtitle')}</span>
					<input bind:value={subtitle} placeholder="—" />
				</label>
				<label class="f">
					<span class="lbl">{$t('spine_title')}</span>
					<input bind:value={spineText} placeholder={title} />
				</label>

				<div class="f">
					<span class="lbl">{$t('cover_palette')}</span>
					<div class="swatches">
						{#each PALETTES as p}
							<button
								type="button"
								class="sw"
								class:on={palette.spine === p.spine}
								title={p.spine}
								aria-label={p.spine}
								style="background:linear-gradient(120deg,{p.spine},{p.foil})"
								onclick={() => (palette = p)}
							></button>
						{/each}
					</div>
				</div>

				{#if error}<p class="err">{error}</p>{/if}

				<div class="bar">
					<button class="mf-btn mf-btn--primary save" onclick={save} disabled={saving}>
						{#if saving}<span class="spin"></span>{:else if savedFlash}<Icon name="check" size={16} />{:else}<Icon name="check" size={16} />{/if}
						{savedFlash ? $t('saved') : $t('save')}
					</button>
					<div class="spacer"></div>
					<button class="mf-btn mf-btn--ghost del" onclick={remove}>
						<Icon name="trash" size={16} />{$t('del')}
					</button>
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.wrap {
		max-width: 980px;
		margin: 0 auto;
		padding: 26px 26px 70px;
	}
	.back {
		margin-bottom: 18px;
	}
	.grid {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 44px;
		align-items: start;
	}
	@media (max-width: 820px) {
		.grid {
			grid-template-columns: 1fr;
			gap: 28px;
		}
	}
	.rise {
		animation: rise 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: var(--d, 0ms);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
	}
	.stage {
		position: sticky;
		top: 24px;
		display: grid;
		justify-items: center;
		gap: 20px;
	}
	.cover-float {
		position: relative;
	}
	.cover-shadow {
		position: absolute;
		left: 8%;
		right: 8%;
		bottom: -16px;
		height: 26px;
		border-radius: 50%;
		background: rgba(40, 28, 14, 0.26);
		filter: blur(12px);
	}
	.actions {
		display: flex;
		gap: 10px;
	}
	.panel {
		min-width: 0;
	}
	.h {
		font-family: var(--font-display);
		font-size: 30px;
		margin: 6px 0 22px;
		letter-spacing: 0.01em;
	}
	.f {
		display: block;
		margin-bottom: 18px;
	}
	.lbl {
		display: block;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin-bottom: 8px;
	}
	.f input {
		width: 100%;
		padding: 11px 14px;
		border-radius: 9px;
		border: 1px solid var(--line-strong);
		background: var(--paper-edge);
		font-size: 16px;
		color: var(--ink);
		outline: none;
		font-family: var(--font-chrome);
		transition:
			border-color 0.18s ease,
			box-shadow 0.18s ease;
	}
	.f input:focus {
		border-color: var(--oxblood);
		box-shadow: 0 0 0 3px rgba(124, 34, 48, 0.12);
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 9px;
	}
	.sw {
		width: 38px;
		height: 38px;
		border-radius: 9px;
		cursor: pointer;
		border: 1px solid var(--line-strong);
		box-shadow: inset 2px 0 4px rgba(0, 0, 0, 0.3);
		transition:
			transform 0.16s ease,
			box-shadow 0.16s ease;
	}
	.sw:hover {
		transform: translateY(-2px);
	}
	.sw.on {
		border-color: var(--ink);
		box-shadow: 0 0 0 2px var(--gilt), inset 2px 0 4px rgba(0, 0, 0, 0.3);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 26px;
		padding-top: 22px;
		border-top: 1px solid var(--line);
	}
	.spacer {
		flex: 1;
	}
	.del {
		color: var(--oxblood);
	}
	.err {
		color: var(--oxblood);
		font-size: 13.5px;
		margin: 4px 0 0;
	}
	.err-box {
		text-align: center;
		padding: 60px;
		color: var(--oxblood);
	}
	.spin {
		width: 15px;
		height: 15px;
		border-radius: 100px;
		border: 2px solid rgba(247, 236, 217, 0.4);
		border-top-color: #f7ecd9;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
