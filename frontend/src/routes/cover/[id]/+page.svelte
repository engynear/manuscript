<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { auth, books as booksApi, currentUser } from '$lib/api';
	import { PALETTES, paletteFor } from '$lib/covers';
	import type { Book, Palette } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import BookCover from '$lib/components/BookCover.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');
	let saving = $state(false);
	let savedFlash = $state(false);

	let palette = $state<Palette>(PALETTES[0]);
	let spineText = $state('');
	let artUrl = $state('');

	const preview = $derived<Book>({
		...(book as Book),
		cover: { palette, spineText, artUrl: artUrl.trim() || null }
	});

	function load(b: Book) {
		book = b;
		palette = b.cover?.palette ?? paletteFor(b);
		spineText = b.cover?.spineText ?? b.title;
		artUrl = b.cover?.artUrl ?? '';
	}

	async function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		artUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(reader.error);
			reader.readAsDataURL(file);
		});
	}

	async function save() {
		if (!book) return;
		saving = true;
		error = '';
		try {
			const updated = await booksApi.update(book.id, {
				title: book.title,
				titleRu: book.titleRu ?? '',
				author: book.author,
				subtitle: book.subtitle ?? '',
				year: book.year ?? null,
				settings: book.settings,
				cover: { palette, spineText: spineText.trim(), artUrl: artUrl.trim() || null },
				sourceMarkdown: book.sourceMarkdown ?? '',
				contentHash: book.contentHash ?? '',
				pageCount: book.pageCount
			});
			load(updated);
			savedFlash = true;
			setTimeout(() => (savedFlash = false), 1400);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save cover';
		} finally {
			saving = false;
		}
	}

	function readBook() {
		if (book) goto(`/reader/${book.id}`);
	}

	onMount(async () => {
		const id = $page.params.id ?? '';
		if (id === 'new') {
			goto('/library');
			return;
		}
		const user = $currentUser ?? (await auth.me());
		if (!user) {
			goto('/signin');
			return;
		}
		try {
			load(await booksApi.get(id));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Not found';
		}
	});
</script>

<div style="max-width:1080px;margin:0 auto;padding:26px 26px 70px">
	<button class="mf-btn mf-btn--ghost" onclick={() => (book ? goto(`/library/${book.id}`) : goto('/library'))}>
		<Icon name="chevL" size={16} />{$t('nav_library')}
	</button>

	{#if error && !book}
		<div style="text-align:center;padding:60px;color:var(--oxblood)">{error}</div>
	{:else if book}
		<div class="cover-grid">
			<aside class="preview">
				<BookCover book={preview} w={300} />
				<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
					<button class="mf-btn mf-btn--primary" onclick={save} disabled={saving}>
						<Icon name="check" size={16} />{savedFlash ? $t('saved') : $t('save_cover')}
					</button>
					<button class="mf-btn" onclick={readBook}>
						<Icon name="read" size={16} />{$t('read')}
					</button>
				</div>
			</aside>

			<section>
				<div class="eyebrow">{$t('edit_cover')}</div>
				<h1 style="font-family:var(--font-display);font-size:30px;margin:6px 0 22px">{book.title}</h1>

				<label class="field">
					<span>{$t('spine_title')}</span>
					<input bind:value={spineText} placeholder={book.title} />
				</label>

				<div class="field">
					<span>{$t('spine_color')}</span>
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

				<label class="field">
					<span>{`${$t('art_source')} URL`}</span>
					<input bind:value={artUrl} placeholder="https://..." />
				</label>

				<label class="upload">
					<Icon name="upload" size={22} />
					<div>
						<strong>{$t('t_upload')}</strong>
						<p>{$t('upload_hint')}</p>
					</div>
					<input type="file" accept="image/png,image/jpeg,image/webp" onchange={onFile} />
				</label>

				{#if artUrl}
					<button class="mf-btn mf-btn--ghost" onclick={() => (artUrl = '')}>
						<Icon name="close" size={16} />{$t('reset')}
					</button>
				{/if}

				{#if error}<p class="err">{error}</p>{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.cover-grid {
		display: grid;
		grid-template-columns: 340px minmax(0, 1fr);
		gap: 46px;
		align-items: start;
		margin-top: 22px;
	}
	.preview {
		position: sticky;
		top: 24px;
		display: grid;
		justify-items: center;
		gap: 22px;
	}
	.field {
		display: block;
		margin-bottom: 18px;
	}
	.field span {
		display: block;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin-bottom: 8px;
	}
	.field input {
		width: 100%;
		padding: 11px 14px;
		border-radius: 9px;
		border: 1px solid var(--line-strong);
		background: var(--paper-edge);
		font-size: 16px;
		color: var(--ink);
		outline: none;
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
	}
	.sw.on {
		border-color: var(--ink);
		box-shadow: 0 0 0 2px var(--gilt), inset 2px 0 4px rgba(0, 0, 0, 0.3);
	}
	.upload {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 18px;
		border: 1.5px dashed var(--line-strong);
		border-radius: 10px;
		background: var(--paper-edge);
		cursor: pointer;
		margin-bottom: 16px;
	}
	.upload p {
		margin: 2px 0 0;
		font-size: 13px;
		color: var(--ink-faint);
	}
	.upload input {
		display: none;
	}
	.err {
		color: var(--oxblood);
	}
	@media (max-width: 820px) {
		.cover-grid {
			grid-template-columns: 1fr;
		}
		.preview {
			position: static;
		}
	}
</style>
