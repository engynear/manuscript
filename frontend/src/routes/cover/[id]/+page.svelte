<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { books as booksApi, currentUser, auth, uploadImage, mediaUrl } from '$lib/api';
	import { PALETTES, paletteFor } from '$lib/covers';
	import { shade } from '$lib/shade';
	import type { Book, Palette } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let book = $state<Book | null>(null);
	let error = $state('');
	let saving = $state(false);
	let savedFlash = $state(false);

	// editable draft
	let title = $state('');
	let author = $state('');
	let subtitle = $state('');
	let spineTitle = $state('');
	let pal = $state<Palette>(PALETTES[0]);
	let hideTitle = $state(false);
	let rotateX = $state(5);
	let rotateY = $state(-34);
	let dragStart = $state<{ x: number; y: number; rx: number; ry: number } | null>(null);

	type Tab = 'templates' | 'generate' | 'upload';
	let tab = $state<Tab>('templates');
	/** Relative media URL of the cover art (persisted), or '' for procedural art. */
	let artUrl = $state('');
	let genBusy = $state(false);
	let uploadErr = $state('');

	const artSrc = $derived(artUrl ? mediaUrl(artUrl) : '');
	const coverColor = $derived(pal.cover ?? pal.spine);
	const bookDepth = $derived(Math.round(Math.max(78, Math.min(138, 66 + Math.sqrt(book?.pageCount ?? 180) * 3.8))));
	const spineFont = $derived(Math.round(Math.max(11, Math.min(17, bookDepth * 0.24))));
	let previewArtFailed = $state(false);

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
		spineTitle = b.cover?.spineText ?? b.title;
		pal = b.cover?.palette ?? paletteFor(b);
		pal = { ...pal, cover: pal.cover ?? pal.spine };
		artUrl = b.cover?.artUrl ?? '';
		hideTitle = Boolean(b.cover?.hideTitle);
	}

	$effect(() => {
		void artSrc;
		previewArtFailed = false;
	});

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

	// Placeholder for AI cover-art generation — not wired to a backend yet, so it
	// resolves to the procedural illumination panel (matching the design prototype).
	function genArt() {
		genBusy = true;
		setTimeout(() => {
			artUrl = '';
			genBusy = false;
		}, 1600);
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
					spineText: spineTitle.trim(),
					artUrl: artUrl || null,
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

	function startRotate(e: PointerEvent) {
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
		dragStart = { x: e.clientX, y: e.clientY, rx: rotateX, ry: rotateY };
	}

	function rotateBook(e: PointerEvent) {
		if (!dragStart) return;
		rotateY = Math.max(-82, Math.min(18, dragStart.ry + (e.clientX - dragStart.x) * 0.2));
		rotateX = Math.max(-16, Math.min(18, dragStart.rx - (e.clientY - dragStart.y) * 0.12));
	}

	function stopRotate() {
		dragStart = null;
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

{#snippet coverArt(p: Palette)}
	<!-- procedural illumination panel (gilt frame + diamond motif) -->
	<div
		style="position:absolute;inset:11% 12% 30%;border:1px solid {p.foil};
			box-shadow:inset 0 0 0 3px rgba(0,0,0,.12),inset 0 0 0 4px {p.foil}55;
			display:grid;place-items:center;overflow:hidden;
			background:radial-gradient(120% 100% at 50% 0%,{p.fg}22,transparent 60%)"
	>
		<div style="display:grid;gap:14%;place-items:center">
			<div style="width:26px;height:26px;transform:rotate(45deg);border:1.5px solid {p.foil};box-shadow:inset 0 0 0 3px {p.fg}33"></div>
			<div style="width:60%;height:1px;background:{p.foil};opacity:.7"></div>
		</div>
	</div>
{/snippet}

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
									artUrl = '';
								}}
							></button>
						{/each}
					</div>
				{:else if tab === 'generate'}
					<div style="margin-bottom:18px">
						<textarea rows="3" placeholder="A barrow-road under a rusted moon, ink and gilt…"></textarea>
						<button class="mf-btn mf-btn--gilt gen" onclick={genArt} disabled={genBusy}>
							<Icon name="sparkle" size={16} />{genBusy ? $t('gen_art_busy') : $t('gen_art')}
						</button>
						{#if genBusy}<div class="prog"><span></span></div>{/if}
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
					</div>
					<label class="f">
						<span class="lbl">{$t('spine_title')}</span>
						<input bind:value={spineTitle} placeholder={title} />
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
					<div
						class="book3d-perspective"
						onpointerdown={startRotate}
						onpointermove={rotateBook}
						onpointerup={stopRotate}
						onpointercancel={stopRotate}
						role="presentation"
					>
						<div
							class="book3d"
							style="--book-depth:{bookDepth}px;--cover-color:{coverColor};--rx:{rotateX}deg;--ry:{rotateY}deg"
						>
							<!-- spine face -->
							<div
								class="spine-face"
								style="background:linear-gradient(90deg,{shade(pal.spine, 0.72)},{pal.spine} 38%,{shade(
									pal.spine,
									1.12
								)} 62%,{shade(
									pal.spine,
									0.78
								)});color:{pal.fg}"
							>
								<div style="width:60%;height:1.5px;background:{pal.foil}"></div>
								<div class="spine-text" style="font-size:{spineFont}px">{spineTitle || title}</div>
								<div style="width:60%;height:1.5px;background:{pal.foil}"></div>
							</div>
							<!-- front cover -->
							<div
								class="front"
								style="background:linear-gradient(108deg,{shade(coverColor, 0.86)} 0%,{coverColor} 8%,{coverColor} 88%,{shade(
									coverColor,
									0.92
								)});color:{pal.fg}"
							>
								<div style="position:absolute;left:10px;top:0;bottom:0;width:1.5px;background:rgba(0,0,0,.25)"></div>
								{#if artSrc && !previewArtFailed}
									<img
										src={artSrc}
										alt=""
										onerror={() => (previewArtFailed = true)}
										style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"
									/>
								{:else}
									{@render coverArt(pal)}
								{/if}
								{#if !hideTitle}
									<div style="position:absolute;left:12%;right:8%;bottom:7%">
										<div class="ct-title">{title || '—'}</div>
										{#if subtitle}<div class="ct-sub">{subtitle}</div>{/if}
										<div style="width:32px;height:1px;background:{pal.foil};margin:8px 0;opacity:.85"></div>
										<div class="ct-author">{author || ''}</div>
									</div>
								{/if}
							</div>
							<div class="book-back" style="background:{pal.spine}"></div>
						</div>
					</div>
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
		grid-template-columns: repeat(5, 1fr);
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
	.book3d-perspective {
		perspective: 1600px;
		display: grid;
		place-items: center;
		width: 100%;
		min-height: 430px;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.book3d-perspective:active {
		cursor: grabbing;
	}
	.book3d {
		position: relative;
		width: 244px;
		height: 360px;
		transform-style: preserve-3d;
		transform: rotateY(var(--ry)) rotateX(var(--rx));
		transition: filter 0.2s ease;
		filter: drop-shadow(0 30px 36px rgba(40, 28, 14, 0.4));
	}
	.spine-face {
		position: absolute;
		left: calc(var(--book-depth) * -1);
		top: 0;
		width: var(--book-depth);
		height: 360px;
		transform-origin: right center;
		transform: rotateY(-90deg);
		backface-visibility: hidden;
		box-shadow: inset -8px 0 16px rgba(0, 0, 0, 0.28), inset 5px 0 10px rgba(255, 255, 255, 0.08);
		overflow: hidden;
	}
	.spine-face::before,
	.spine-face::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: rgba(0, 0, 0, 0.22);
	}
	.spine-face::before {
		left: 9px;
	}
	.spine-face::after {
		right: 9px;
	}
	.spine-face {
		transform-origin: left center;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 14px;
		border-radius: 3px 0 0 3px;
	}
	.spine-text {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-display);
		font-weight: 700;
		line-height: 1.05;
		letter-spacing: 0.02em;
		max-height: 260px;
		max-width: calc(var(--book-depth) - 16px);
		text-align: center;
		overflow-wrap: anywhere;
		word-break: break-word;
		overflow: hidden;
		text-shadow: 0 1px 1px rgba(0, 0, 0, 0.4);
	}
	.front {
		width: 244px;
		height: 360px;
		position: absolute;
		inset: 0;
		border-radius: 3px 7px 7px 3px;
		overflow: hidden;
		transform: translateZ(calc(var(--book-depth) * 0.5));
		backface-visibility: hidden;
		box-shadow: inset 6px 0 12px rgba(0, 0, 0, 0.32), inset -2px 0 4px rgba(255, 255, 255, 0.08);
	}
	.book-back {
		position: absolute;
		inset: 0;
		border-radius: 3px 7px 7px 3px;
		transform: rotateY(180deg) translateZ(calc(var(--book-depth) * 0.5));
		backface-visibility: hidden;
		box-shadow: inset -8px 0 14px rgba(0, 0, 0, 0.24);
	}
	.ct-title {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 23px;
		line-height: 1.08;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
		text-wrap: balance;
	}
	.ct-sub {
		font-family: var(--font-scribe);
		font-style: italic;
		font-size: 13.5px;
		opacity: 0.9;
		margin: 6px 0;
	}
	.ct-author {
		font-family: var(--font-display);
		font-size: 12px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		opacity: 0.88;
	}
</style>
