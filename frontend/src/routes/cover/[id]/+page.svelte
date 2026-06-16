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
	import BookSpine from '$lib/components/BookSpine.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');
	let saving = $state(false);
	let savedFlash = $state(false);

	let palette = $state<Palette>(PALETTES[0]);
	let spineText = $state('');
	let artUrl = $state('');
	let artUrlInput = $state('');
	let uploadedArtName = $state('');
	let author = $state('');
	let titleColor = $state('#f2ddb2');
	let hideTitle = $state(false);

	const preview = $derived<Book>({
		...(book as Book),
		author,
		cover: { palette, spineText, artUrl: artUrl.trim() || null, titleColor, hideTitle }
	});

	function load(b: Book) {
		book = b;
		palette = b.cover?.palette ?? paletteFor(b);
		spineText = b.cover?.spineText ?? b.title;
		artUrl = b.cover?.artUrl ?? '';
		artUrlInput = artUrl.startsWith('data:') ? '' : artUrl;
		uploadedArtName = artUrl.startsWith('data:') ? $t('uploaded_image') : '';
		author = b.author;
		titleColor = b.cover?.titleColor ?? (b.cover?.artUrl ? '#f2ddb2' : palette.fg);
		hideTitle = Boolean(b.cover?.hideTitle);
	}

	function onArtUrlInput(value: string) {
		artUrlInput = value;
		artUrl = value.trim();
		uploadedArtName = '';
	}

	function clearArt() {
		artUrl = '';
		artUrlInput = '';
		uploadedArtName = '';
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
		artUrlInput = '';
		uploadedArtName = file.name;
	}

	async function save() {
		if (!book) return;
		saving = true;
		error = '';
		try {
			const updated = await booksApi.update(book.id, {
				title: book.title,
				titleRu: book.titleRu ?? '',
				author: author.trim(),
				subtitle: book.subtitle ?? '',
				year: book.year ?? null,
				settings: book.settings,
				cover: { palette, spineText: spineText.trim(), artUrl: artUrl.trim() || null, titleColor, hideTitle },
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
	<button class="mf-btn mf-btn--ghost" onclick={() => goto('/library')}>
		<Icon name="chevL" size={16} />{$t('nav_library')}
	</button>

	{#if error && !book}
		<div style="text-align:center;padding:60px;color:var(--oxblood)">{error}</div>
	{:else if book}
		<div class="cover-grid">
			<aside class="preview">
				<div class="book-preview">
					<BookSpine book={preview} h={390} />
					<BookCover book={preview} w={260} />
				</div>
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
					<span>{$t('f_author')}</span>
					<input bind:value={author} placeholder={$t('anon')} />
				</label>

				<label class="field">
					<span>{$t('spine_title')}</span>
					<textarea
						bind:value={spineText}
						rows="3"
						placeholder={`${book.title}\nТом 3`}
						spellcheck="false"
					></textarea>
					<small>Enter создаёт отдельную строку на корешке.</small>
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

				<div class="art-panel">
					<div class="art-head">
						<span>{$t('art_source')}</span>
						{#if artUrl}
							<button type="button" class="art-clear" onclick={clearArt}>
								<Icon name="close" size={14} />{$t('reset')}
							</button>
						{/if}
					</div>

					{#if artUrl}
						<div class="art-current">
							<img src={artUrl} alt="" />
							<div>
								<strong>{uploadedArtName ? $t('uploaded_image') : `${$t('art_source')} URL`}</strong>
								<p>{uploadedArtName || artUrlInput}</p>
							</div>
						</div>
					{/if}

					<label class="field art-url">
						<span>{`${$t('art_source')} URL`}</span>
						<input value={artUrlInput} placeholder="https://..." oninput={(e) => onArtUrlInput(e.currentTarget.value)} />
					</label>

					<label class="upload">
						<Icon name="upload" size={22} />
						<div>
							<strong>{$t('t_upload')}</strong>
							<p>{$t('upload_hint')}</p>
						</div>
						<input type="file" accept="image/png,image/jpeg,image/webp" onchange={onFile} />
					</label>
				</div>

				<label class="field">
					<span>{$t('cover_text_color')}</span>
					<input type="color" bind:value={titleColor} />
				</label>

				<label class="check-field">
					<input type="checkbox" bind:checked={hideTitle} />
					<span>{$t('cover_hide_title')}</span>
				</label>

				{#if error}<p class="err">{error}</p>{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.cover-grid {
		display: grid;
		grid-template-columns: minmax(360px, 430px) minmax(0, 1fr);
		gap: 34px;
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
	.book-preview {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		max-width: 100%;
		filter: drop-shadow(0 18px 22px rgba(40, 28, 14, 0.24));
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
	.field textarea {
		width: 100%;
		min-height: 86px;
		resize: vertical;
		padding: 11px 14px;
		border-radius: 9px;
		border: 1px solid var(--line-strong);
		background: var(--paper-edge);
		font-size: 16px;
		line-height: 1.35;
		color: var(--ink);
		outline: none;
	}
	.field small {
		display: block;
		margin-top: 6px;
		font-size: 12.5px;
		color: var(--ink-faint);
	}
	.field input[type='color'] {
		width: 72px;
		height: 42px;
		padding: 4px;
		cursor: pointer;
	}
	.check-field {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 18px;
		color: var(--ink);
		font-size: 15px;
		cursor: pointer;
	}
	.check-field input {
		width: 17px;
		height: 17px;
		accent-color: var(--oxblood);
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
	.art-panel {
		margin: 4px 0 18px;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: color-mix(in srgb, var(--paper-edge) 72%, white);
	}
	.art-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}
	.art-head > span {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
	}
	.art-clear {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: none;
		background: transparent;
		color: var(--oxblood);
		font: 700 13px/1 var(--font-chrome);
		cursor: pointer;
	}
	.art-current {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 12px;
		align-items: center;
		margin-bottom: 14px;
		padding: 10px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.42);
		border: 1px solid var(--line);
	}
	.art-current img {
		width: 72px;
		height: 96px;
		border-radius: 5px;
		object-fit: cover;
		box-shadow: 0 6px 16px rgba(40, 28, 14, 0.18);
	}
	.art-current strong {
		display: block;
		font-size: 14px;
	}
	.art-current p {
		margin: 4px 0 0;
		font-size: 12.5px;
		color: var(--ink-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.art-url {
		margin-bottom: 12px;
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
