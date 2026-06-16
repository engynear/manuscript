<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t, lang } from '$lib/i18n';
	import { shelves as shelvesApi, books as booksApi, currentUser, auth } from '$lib/api';
	import type { Book, Shelf } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import BookCover from '$lib/components/BookCover.svelte';
	import BookSpine from '$lib/components/BookSpine.svelte';
	import ShareModal from '$lib/components/ShareModal.svelte';

	let shelves = $state<Shelf[]>([]);
	let books = $state<Book[]>([]);
	let loading = $state(true);
	let shareShelf = $state<Shelf | null>(null);
	let addBookShelf = $state<Shelf | null>(null);
	let shelfQuery = $state('');
	let editingId = $state<string | null>(null);

	const byId = $derived(new Map(books.map((b) => [b.id, b])));

	let drag = $state<{ shelfId: string; from: number } | null>(null);

	async function load() {
		loading = true;
		[shelves, books] = await Promise.all([shelvesApi.list(), booksApi.list()]);
		loading = false;
	}

	function shelfName(s: Shelf): string {
		return $lang === 'ru' && s.nameRu ? s.nameRu : s.name;
	}

	async function createShelf() {
		const s = await shelvesApi.create($t('new_shelf'));
		shelves = [...shelves, s];
	}

	async function rename(s: Shelf, value: string) {
		editingId = null;
		if (!value.trim() || value === s.name) return;
		const updated = await shelvesApi.rename(s.id, value, value);
		shelves = shelves.map((x) => (x.id === s.id ? updated : x));
	}

	async function removeShelf(s: Shelf) {
		await shelvesApi.remove(s.id);
		shelves = shelves.filter((x) => x.id !== s.id);
	}

	async function toggleBook(s: Shelf, bookId: string) {
		const has = s.books.includes(bookId);
		const next = has ? s.books.filter((b) => b !== bookId) : [...s.books, bookId];
		const updated = await shelvesApi.setBooks(s.id, next);
		shelves = shelves.map((x) => (x.id === s.id ? updated : x));
		addBookShelf = updated;
	}

	function shelfPickerBooks() {
		const q = shelfQuery.trim().toLowerCase();
		if (!q) return books;
		return books.filter((b) => `${b.title} ${b.author}`.toLowerCase().includes(q));
	}

	async function reorder(s: Shelf, from: number, to: number) {
		if (from === to) return;
		const arr = [...s.books];
		const [m] = arr.splice(from, 1);
		arr.splice(to, 0, m);
		const updated = await shelvesApi.setBooks(s.id, arr);
		shelves = shelves.map((x) => (x.id === s.id ? updated : x));
	}

	onMount(async () => {
		const user = $currentUser ?? (await auth.me());
		if (!user) {
			goto('/signin');
			return;
		}
		load();
	});
</script>

<div style="max-width:1320px;margin:0 auto;padding:30px 26px 80px">
	<div style="display:flex;align-items:flex-end;gap:16px;margin-bottom:30px;flex-wrap:wrap">
		<div>
			<div class="eyebrow">{$t('nav_shelves')}</div>
			<h1 style="font-family:var(--font-display);font-size:30px;margin:6px 0 2px">{$t('shelves_title')}</h1>
			<div style="font-size:15px;color:var(--ink-faint)">{$t('shelves_sub')}</div>
		</div>
		<div style="flex:1"></div>
		<button class="mf-btn" onclick={createShelf}><Icon name="plus" size={17} />{$t('new_shelf')}</button>
	</div>

	{#if loading}
		<div style="text-align:center;padding:60px;color:var(--ink-faint)">…</div>
	{/if}

	{#each shelves as shelf, si (shelf.id)}
		{@const shelfBooks = shelf.books.map((id) => byId.get(id)).filter(Boolean) as Book[]}
		<section class="shelf-in" style="margin-bottom:46px;animation-delay:{si * 70}ms">
			<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding-left:4px">
				{#if editingId === shelf.id}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						autofocus
						value={shelfName(shelf)}
						onblur={(e) => rename(shelf, (e.target as HTMLInputElement).value)}
						onkeydown={(e) => e.key === 'Enter' && rename(shelf, (e.currentTarget as HTMLInputElement).value)}
						style="font-family:var(--font-display);font-size:21px;font-weight:600;border:none;border-bottom:2px solid var(--gilt);background:transparent;color:var(--ink);outline:none;padding:2px 0"
					/>
				{:else}
					<button
						class="shelf-name"
						onclick={() => (editingId = shelf.id)}
						title={$t('rename')}
					>
						{shelfName(shelf)}
					</button>
				{/if}
				<span class="mf-chip">{shelfBooks.length}</span>
				<div style="flex:1"></div>
				<button class="mf-btn mf-btn--ghost" onclick={() => (addBookShelf = shelf)} style="padding:6px 12px"><Icon name="edit" size={16} /><span class="hide-sm">{$t('edit_shelf')}</span></button>
				<button class="mf-btn mf-btn--ghost" onclick={() => (shareShelf = shelf)} style="padding:6px 12px"><Icon name="share" size={16} /><span class="hide-sm">{$t('share')}</span></button>
				<button class="mf-btn mf-btn--ghost" onclick={() => removeShelf(shelf)} style="padding:8px;color:var(--oxblood)"><Icon name="trash" size={16} /></button>
			</div>

			<div style="position:relative">
				<div
					class="leather-surface"
					role="list"
					ondragover={(e) => e.preventDefault()}
					ondrop={(e) => {
						e.preventDefault();
						if (drag && drag.shelfId === shelf.id) reorder(shelf, drag.from, shelfBooks.length - 1);
						drag = null;
					}}
					style="border-radius:8px 8px 0 0;padding:20px 22px 0;overflow-x:auto;box-shadow:inset 0 1px 0 rgba(255,220,170,.12)"
				>
					{#if shelfBooks.length === 0}
						<div style="min-height:200px;display:grid;place-items:center;text-align:center;color:rgba(245,236,214,.78);padding:20px">
							<div>
								<div style="margin-top:8px;font-size:14.5px;max-width:320px;font-family:var(--font-chrome)">{$t('empty_shelf')}</div>
							</div>
						</div>
					{:else}
						<div style="display:flex;align-items:flex-end;gap:5px;min-height:232px;padding-bottom:2px">
							{#each shelfBooks as book, i (book.id)}
								<div
									role="listitem"
									draggable="true"
									ondragstart={() => (drag = { shelfId: shelf.id, from: i })}
									ondragover={(e) => e.preventDefault()}
									ondrop={(e) => {
										e.preventDefault();
										e.stopPropagation();
										if (drag && drag.shelfId === shelf.id) reorder(shelf, drag.from, i);
										drag = null;
									}}
									style="cursor:grab"
								>
									<BookSpine {book} h={232} onclick={() => goto(`/reader/${book.id}`)} />
								</div>
							{/each}
						</div>
					{/if}
				</div>
				<div class="wood-surface" style="height:var(--shelf-wood-h);border-radius:0 0 4px 4px"></div>
			</div>
			{#if shelfBooks.length > 0}
				<div style="font-size:12.5px;color:var(--ink-faint);margin-top:8px;padding-left:4px;display:flex;align-items:center;gap:6px">
					<Icon name="grip" size={13} />{$t('drag_hint')}
				</div>
			{/if}
		</section>
	{/each}
</div>

{#if shareShelf}
	<ShareModal shelf={shareShelf} onclose={() => (shareShelf = null)} />
{/if}

{#if addBookShelf}
	{@const target = addBookShelf}
	<div
		onmousedown={() => (addBookShelf = null)}
		role="presentation"
		style="position:fixed;inset:0;z-index:110;background:rgba(38,28,16,.5);backdrop-filter:blur(4px);display:grid;place-items:center;padding:24px"
		class="mf-fade"
	>
		<div
			onmousedown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			class="mf-card mf-fade-up"
			style="width:min(560px,96vw);max-height:80vh;display:flex;flex-direction:column;background:var(--paper-card)"
		>
			<div style="padding:20px 24px;border-bottom:1px solid var(--line);display:grid;gap:14px">
				<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
					<h2 style="font-family:var(--font-display);font-size:19px;margin:0">{$t('edit_shelf')}</h2>
					<button class="mf-btn mf-btn--ghost" onclick={() => (addBookShelf = null)} style="padding:6px"><Icon name="close" size={18} /></button>
				</div>
				<label class="picker-search">
					<Icon name="search" size={16} />
					<input bind:value={shelfQuery} placeholder={$t('search')} />
				</label>
			</div>
			<div style="overflow:auto;padding:12px">
				{#if books.length === 0}
					<div style="padding:20px;text-align:center;color:var(--ink-faint)">{$t('empty_lib_sub')}</div>
				{:else}
					<div class="book-picker-grid">
						{#each shelfPickerBooks() as b (b.id)}
							{@const on = (shelves.find((s) => s.id === target.id)?.books ?? []).includes(b.id)}
							<button class="book-card" class:on onclick={() => toggleBook(target, b.id)}>
								<BookCover book={b} w={78} title={false} />
								<span class="book-card-title">{b.title}</span>
								<span class="book-card-author">{b.author || $t('anon')}</span>
								<span class="book-card-check">
									{#if on}<Icon name="check" size={13} stroke={3} />{/if}
								</span>
							</button>
						{/each}
					</div>
					{#if shelfPickerBooks().length === 0}
						<div style="padding:28px;text-align:center;color:var(--ink-faint)">{$t('empty_search')}</div>
					{/if}
				{/if}
			</div>
			<div style="padding:16px;border-top:1px solid var(--line)">
				<button class="mf-btn mf-btn--primary" onclick={() => (addBookShelf = null)} style="width:100%;justify-content:center">{$t('done')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.shelf-in {
		animation: shelf-in 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes shelf-in {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
	}
	.shelf-name {
		margin: 0;
		border: none;
		background: none;
		padding: 0;
		font-family: var(--font-display);
		font-size: 21px;
		font-weight: 600;
		color: var(--ink);
		cursor: text;
		border-bottom: 2px solid transparent;
		transition: border-color 0.15s ease;
	}
	.shelf-name:hover {
		border-bottom-color: var(--line-strong);
	}
	.picker-search {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: var(--paper-edge);
		color: var(--ink-faint);
	}
	.picker-search input {
		width: 100%;
		border: none;
		outline: none;
		background: transparent;
		color: var(--ink);
		font-size: 14px;
	}
	.book-picker-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
		gap: 12px;
	}
	.book-card {
		position: relative;
		display: grid;
		justify-items: center;
		gap: 6px;
		min-height: 178px;
		padding: 10px 8px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--paper-edge);
		color: var(--ink);
		cursor: pointer;
		font-family: var(--font-chrome);
		text-align: center;
		transition:
			transform 0.14s ease,
			border-color 0.14s ease,
			background 0.14s ease;
	}
	.book-card:hover {
		transform: translateY(-2px);
		background: #fffaf0;
	}
	.book-card.on {
		border-color: var(--oxblood);
		box-shadow: 0 0 0 2px rgba(124, 34, 48, 0.16);
	}
	.book-card-title {
		width: 100%;
		font-weight: 700;
		font-size: 13px;
		line-height: 1.15;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.book-card-author {
		width: 100%;
		font-size: 12.5px;
		color: var(--ink-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.book-card-check {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		display: grid;
		place-items: center;
		color: #f0dcc0;
		border: 1.5px solid var(--line-strong);
		background: rgba(250, 245, 234, 0.92);
	}
	.book-card.on .book-card-check {
		border-color: var(--oxblood);
		background: var(--oxblood);
	}
</style>
