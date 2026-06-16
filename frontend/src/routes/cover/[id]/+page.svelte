<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { books as booksApi, currentUser, auth, uploadImage, mediaUrl, generateCoverArt } from '$lib/api';
	import { PALETTES, paletteFor } from '$lib/covers';
	import { shade } from '$lib/shade';
	import type { Book } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import CoverBook3D from '$lib/components/CoverBook3D.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');
	let saving = $state(false);
	let savedFlash = $state(false);

	// editable draft
	let title = $state('');
	let author = $state('');
	let subtitle = $state('');
	let coverText = $state('');
	let spineTitle = $state('');
	let pal = $state(PALETTES[0]);
	let coverTextColor = $state('');
	let spineTextColor = $state('');
	let hideTitle = $state(false);

	type Tab = 'templates' | 'generate' | 'upload';
	let tab = $state<Tab>('templates');
	/** Relative media URL of the cover art (persisted), or '' for procedural art. */
	let artUrl = $state('');
	let artHistory = $state<string[]>([]);
	let coverPrompt = $state('');
	let genBusy = $state(false);
	let genErr = $state('');
	let uploadErr = $state('');

	const artSrc = $derived(artUrl ? mediaUrl(artUrl) : '');
	const coverColor = $derived(pal.cover ?? pal.spine);

	// Spine colours from the design (a curated subset of the palette spines).
	const spineColors = [
		'#732030', '#2f4632', '#27324a', '#234945', '#42263f',
		'#8a4423', '#9a7b3f', '#3b4148', '#5a1f2b', '#23201d'
	];

	function load(b: Book) {
		book = b;
		title = b.title;
		author = b.author;
		subtitle = b.subtitle ?? '';
		coverText = b.cover?.titleText ?? defaultCoverText(b.title, b.author);
		spineTitle = b.cover?.spineText ?? b.title;
		pal = b.cover?.palette ?? paletteFor(b);
		pal = { ...pal, cover: pal.cover ?? pal.spine };
		coverTextColor = b.cover?.titleColor ?? pal.fg;
		spineTextColor = b.cover?.spineTextColor ?? pal.fg;
		artUrl = b.cover?.artUrl ?? '';
		artHistory = uniqueUrls(b.cover?.artHistory ?? (b.cover?.artUrl ? [b.cover.artUrl] : []));
		hideTitle = Boolean(b.cover?.hideTitle);
	}

	function defaultCoverText(t: string, a: string) {
		return t || a;
	}

	function uniqueUrls(urls: string[]) {
		return Array.from(new Set(urls.filter(Boolean)));
	}

	async function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (!f) return;
		uploadErr = '';
		try {
			artUrl = await uploadImage(f);
		} catch {
			uploadErr = $t('upload_failed');
		}
	}

	async function genArt() {
		genBusy = true;
		genErr = '';
		try {
			const url = await generateCoverArt({
				prompt: coverPrompt.trim(),
				title: title.trim(),
				author: author.trim()
			});
			artUrl = url;
			artHistory = uniqueUrls([url, ...artHistory]);
		} catch (e) {
			genErr = e instanceof Error ? e.message : $t('upload_failed');
		} finally {
			genBusy = false;
		}
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
				cover: {
					...(book.cover ?? {}),
					palette: { ...pal, cover: coverColor },
					titleText: coverText.trim(),
					spineText: spineTitle.trim(),
					artUrl: artUrl || null,
					artHistory,
					titleColor: coverTextColor,
					spineTextColor,
					hideTitle
				},
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
	<button class="mf-btn mf-btn--ghost back-btn" onclick={() => goto('/library')}>
		<Icon name="chevL" size={16} />{$t('nav_library')}
	</button>

	{#if error && !book}
		<div class="err-box">{error}</div>
	{:else if book}
		<div class="cover-grid">
			<!-- controls -->
			<div class="mf-card panel">
				<div class="eyebrow">{$t('cover_title')}</div>
				<h1 class="h">{$t('cover_title')}</h1>
				<div class="sub">{$t('cover_sub')}</div>

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
					<span class="lbl">{$t('cover_text')}</span>
					<textarea rows="4" bind:value={coverText} placeholder={title}></textarea>
				</label>

				<!-- art source tabs -->
				<div class="lbl" style="margin:8px 0 9px">{$t('art_source')}</div>
				<div class="tabs">
					{#each [['templates', 't_templates'], ['generate', 't_generate'], ['upload', 't_upload']] as [k, l]}
						<button class="tab" class:on={tab === k} onclick={() => (tab = k as Tab)}>{$t(l)}</button>
					{/each}
				</div>

				{#if tab === 'templates'}
					<div class="templates">
						{#each PALETTES as p}
							<button
								class="tpl"
								class:on={coverColor === p.spine && !artUrl}
								title={p.spine}
								aria-label={p.spine}
								style="background:linear-gradient(120deg,{p.spine},{shade(p.spine, 1.12)})"
								onclick={() => {
									pal = { ...pal, cover: p.spine, fg: p.fg, foil: p.foil };
									if (!coverTextColor) coverTextColor = p.fg;
									artUrl = '';
								}}
							></button>
						{/each}
						<label class="tpl custom-color" title={$t('cover_color')}>
							<input
								type="color"
								value={coverColor}
								oninput={(e) => (pal = { ...pal, cover: (e.currentTarget as HTMLInputElement).value })}
							/>
						</label>
					</div>
					<label class="inline-color">
						<span>{$t('cover_text_color')}</span>
						<input type="color" bind:value={coverTextColor} />
					</label>
				{:else if tab === 'generate'}
					<div style="margin-bottom:18px">
						<textarea
							rows="3"
							bind:value={coverPrompt}
							placeholder="A barrow-road under a rusted moon, ink and gilt…"
						></textarea>
						<button class="mf-btn mf-btn--gilt gen" onclick={genArt} disabled={genBusy}>
							<Icon name="sparkle" size={16} />{genBusy ? $t('gen_art_busy') : $t('gen_art')}
						</button>
						{#if genBusy}<div class="prog"><span></span></div>{/if}
						{#if genErr}<p class="err">{genErr}</p>{/if}
						{#if artHistory.length}
							<div class="art-gallery" aria-label={$t('generated_gallery')}>
								{#each artHistory as url (url)}
									<div class="art-tile" class:on={artUrl === url}>
										<button class="art-pick" onclick={() => (artUrl = url)} aria-label={$t('select')}>
											<img src={mediaUrl(url)} alt="" />
										</button>
										<a class="art-download" href={mediaUrl(url)} download>
											<Icon name="download" size={14} />{$t('download_art')}
										</a>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<label class="drop">
						<Icon name="image" size={26} style="color:var(--gilt)" />
						<div class="drop-hint">{$t('upload_hint')}</div>
						<input type="file" accept="image/png,image/jpeg,image/webp" onchange={onFile} />
					</label>
					{#if uploadErr}<p class="err">{uploadErr}</p>{/if}
				{/if}

				<label class="check-row">
					<input type="checkbox" bind:checked={hideTitle} />
					<span>{$t('cover_hide_title')}</span>
				</label>

				<!-- spine -->
				<div class="spine-sec">
					<div class="lbl" style="margin-bottom:10px">{$t('spine')}</div>
					<div class="sub" style="margin-bottom:8px">{$t('spine_color')}</div>
					<div class="swatches">
						{#each spineColors as c}
							<button
								class="sw"
								class:on={pal.spine === c}
								aria-pressed={pal.spine === c}
								aria-label={c}
								title={c}
								style="background:{c}"
								onclick={() => (pal = { ...pal, spine: c })}
							></button>
						{/each}
						<label class="sw custom-color" title={$t('spine_color')}>
							<input
								type="color"
								value={pal.spine}
								oninput={(e) => (pal = { ...pal, spine: (e.currentTarget as HTMLInputElement).value })}
							/>
						</label>
					</div>
					<label class="inline-color">
						<span>{$t('spine_text_color')}</span>
						<input type="color" bind:value={spineTextColor} />
					</label>
					<label class="f">
						<span class="lbl">{$t('spine_title')}</span>
						<textarea rows="3" bind:value={spineTitle} placeholder={title}></textarea>
					</label>
				</div>

				{#if error}<p class="err">{error}</p>{/if}

				<button class="mf-btn mf-btn--primary save" onclick={save} disabled={saving}>
					{#if saving}<span class="spin"></span>{:else}<Icon name="check" size={17} />{/if}
					{savedFlash ? $t('saved') : $t('save_cover')}
				</button>
			</div>

			<!-- live preview -->
			<div class="mf-card preview">
				<div class="stage">
					<CoverBook3D
						{artSrc}
						{coverText}
						coverAuthor={author}
						spineText={spineTitle}
						{coverColor}
						spineColor={pal.spine}
						{coverTextColor}
						{spineTextColor}
						foilColor={pal.foil}
						{hideTitle}
						pageCount={book.pageCount}
					/>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.wrap {
		max-width: 1320px;
		margin: 0 auto;
		padding: 24px 26px 60px;
	}
	.back-btn {
		margin-bottom: 16px;
	}
	.cover-grid {
		display: grid;
		grid-template-columns: 400px 1fr;
		gap: 30px;
		align-items: start;
	}
	@media (max-width: 860px) {
		.cover-grid {
			grid-template-columns: 1fr;
			gap: 24px;
		}
	}
	.panel {
		padding: 22px 24px;
	}
	.h {
		font-family: var(--font-display);
		font-size: 24px;
		margin: 4px 0 4px;
	}
	.sub {
		font-size: 14px;
		color: var(--ink-faint);
		margin-bottom: 22px;
	}
	.f {
		display: block;
		margin-bottom: 16px;
	}
	.lbl {
		display: block;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-soft);
		margin-bottom: 7px;
	}
	.f input,
	textarea {
		width: 100%;
		padding: 10px 13px;
		border-radius: 9px;
		border: 1px solid var(--line-strong);
		background: var(--paper-edge);
		font-size: 15px;
		color: var(--ink);
		outline: none;
		font-family: var(--font-chrome);
		transition: border-color 0.18s ease, box-shadow 0.18s ease;
	}
	textarea {
		resize: vertical;
		margin-bottom: 10px;
	}
	.f input:focus,
	textarea:focus {
		border-color: var(--oxblood);
		box-shadow: 0 0 0 3px rgba(124, 34, 48, 0.12);
	}
	.tabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		background: var(--paper-deep);
		border-radius: 10px;
		margin-bottom: 14px;
	}
	.tab {
		flex: 1;
		border: none;
		border-radius: 7px;
		padding: 8px;
		font-weight: 600;
		font-size: 13.5px;
		cursor: pointer;
		background: transparent;
		color: var(--ink-soft);
		font-family: var(--font-chrome);
	}
	.tab.on {
		background: var(--paper-card);
		color: var(--oxblood);
		box-shadow: var(--shadow-sm);
	}
	.templates {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 8px;
		margin-bottom: 18px;
	}
	.tpl {
		aspect-ratio: 1 / 1.4;
		border-radius: 5px;
		cursor: pointer;
		border: 1px solid var(--line);
		box-shadow: inset 2px 0 4px rgba(0, 0, 0, 0.3);
	}
	.tpl.on {
		border: 2px solid var(--oxblood);
	}
	.gen {
		width: 100%;
		justify-content: center;
	}
	.prog {
		height: 5px;
		background: var(--paper-deep);
		border-radius: 100px;
		overflow: hidden;
		margin-top: 12px;
	}
	.prog span {
		display: block;
		width: 60%;
		height: 100%;
		background: linear-gradient(90deg, var(--gilt), var(--oxblood));
		animation: prog 1s ease infinite alternate;
	}
	@keyframes prog {
		from {
			transform: translateX(-30%);
		}
		to {
			transform: translateX(120%);
		}
	}
	.drop {
		display: grid;
		place-items: center;
		gap: 8px;
		padding: 28px 16px;
		margin-bottom: 18px;
		border: 2px dashed var(--line-strong);
		border-radius: 10px;
		background: var(--paper-edge);
		cursor: pointer;
		text-align: center;
	}
	.drop-hint {
		font-size: 13.5px;
		color: var(--ink-faint);
	}
	.drop input {
		display: none;
	}
	.check-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: -2px 0 18px;
		font-family: var(--font-chrome);
		font-size: 14px;
		color: var(--ink-soft);
		cursor: pointer;
	}
	.check-row input {
		width: 18px;
		height: 18px;
		accent-color: var(--oxblood);
	}
	.spine-sec {
		border-top: 1px solid var(--line);
		padding-top: 18px;
	}
	.swatches {
		display: flex;
		gap: 7px;
		flex-wrap: wrap;
		margin-bottom: 14px;
	}
	.sw {
		width: 30px;
		height: 30px;
		border-radius: 7px;
		cursor: pointer;
		border: 1px solid var(--line-strong);
	}
	.sw.on {
		border: 2px solid var(--ink);
		box-shadow: 0 0 0 2px var(--gilt);
	}
	.custom-color {
		position: relative;
		display: grid;
		place-items: center;
		background:
			linear-gradient(45deg, transparent 46%, var(--ink) 47% 53%, transparent 54%),
			conic-gradient(#d93636, #d9c436, #4caf50, #369bd9, #8f36d9, #d93636);
		overflow: hidden;
	}
	.custom-color::after {
		content: '+';
		width: 18px;
		height: 18px;
		border-radius: 99px;
		display: grid;
		place-items: center;
		background: var(--paper-card);
		color: var(--ink);
		font-weight: 700;
		line-height: 1;
	}
	.custom-color input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.inline-color {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: -4px 0 16px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--paper-edge);
		font-size: 13px;
		color: var(--ink-soft);
	}
	.inline-color input {
		width: 38px;
		height: 28px;
		padding: 0;
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		background: transparent;
	}
	.art-gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
		gap: 10px;
		margin-top: 14px;
	}
	.art-tile {
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--paper-edge);
		padding: 6px;
	}
	.art-tile.on {
		border-color: var(--oxblood);
		box-shadow: 0 0 0 2px rgba(124, 34, 48, 0.18);
	}
	.art-pick {
		display: block;
		width: 100%;
		aspect-ratio: 2 / 3;
		border: none;
		padding: 0;
		border-radius: 5px;
		overflow: hidden;
		background: var(--paper-deep);
	}
	.art-pick img {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
	}
	.art-download {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		width: 100%;
		margin-top: 6px;
		font-size: 11.5px;
		color: var(--ink-soft);
		text-decoration: none;
	}
	.save {
		width: 100%;
		justify-content: center;
		margin-top: 6px;
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

	/* live preview */
	.preview {
		padding: 40px;
		min-height: 520px;
		display: flex;
		flex-direction: column;
		background: linear-gradient(180deg, var(--paper-card), var(--paper-deep));
	}
	.stage {
		flex: 1;
		display: grid;
		place-items: center;
	}
</style>
