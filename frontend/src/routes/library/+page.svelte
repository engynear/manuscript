<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { books as booksApi, currentUser, auth, mediaUrl } from '$lib/api';
	import type { Book } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import BookCover from '$lib/components/BookCover.svelte';
	import AddToShelfModal from '$lib/components/AddToShelfModal.svelte';

	let books = $state<Book[]>([]);
	let loading = $state(true);
	let error = $state('');
	let q = $state('');
	let sort = $state<'recent' | 'title' | 'author'>('recent');
	let addToShelfBook = $state<string | null>(null);

	const filtered = $derived(
		books
			.filter((b) => !q || (b.title + b.author).toLowerCase().includes(q.toLowerCase()))
			.slice()
			.sort((a, b) =>
				sort === 'title'
					? a.title.localeCompare(b.title)
					: sort === 'author'
						? a.author.localeCompare(b.author)
						: 0
			)
	);

	async function load() {
		loading = true;
		error = '';
		try {
			books = await booksApi.list();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load library';
		} finally {
			loading = false;
		}
	}

	async function remove(id: string) {
		await booksApi.remove(id);
		books = books.filter((b) => b.id !== id);
	}

	onMount(async () => {
		// Wait for session restore before guarding (token may still be resolving).
		const user = $currentUser ?? (await auth.me());
		if (!user) {
			goto('/signin');
			return;
		}
		load();
	});
</script>

<div style="max-width:1320px;margin:0 auto;padding:30px 26px 60px">
	<div style="margin-bottom:24px">
		<div class="eyebrow">{$t('nav_library')}</div>
		<h1 style="font-family:var(--font-display);font-size:30px;margin:6px 0 2px">{$t('library_title')}</h1>
		<div style="font-size:15px;color:var(--ink-faint)">{$t('library_sub')}</div>
	</div>

	<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:26px">
		<div style="position:relative;flex:1 1 260px;max-width:380px">
			<span style="position:absolute;left:12px;top:11px;color:var(--ink-faint)"><Icon name="search" size={17} /></span>
			<input
				bind:value={q}
				placeholder={$t('search')}
				style="width:100%;padding:10px 12px 10px 38px;border-radius:100px;border:1px solid var(--line-strong);background:var(--paper-card);font-size:14.5px;color:var(--ink);outline:none"
			/>
		</div>
		<span style="font-size:13.5px;color:var(--ink-faint)"
			>{filtered.length} {filtered.length === 1 ? $t('book_count_one') : $t('books_count')}</span
		>
		<div style="flex:1"></div>
		<div
			style="display:flex;align-items:center;gap:8px;padding:6px 8px 6px 14px;border-radius:100px;border:1px solid var(--line-strong);background:var(--paper-card)"
		>
			<Icon name="sort" size={16} style="color:var(--ink-faint)" />
			<select bind:value={sort} style="border:none;background:none;font-size:14.5px;font-weight:600;color:var(--ink);outline:none;cursor:pointer">
				<option value="recent">{$t('sort_recent')}</option>
				<option value="title">{$t('sort_title')}</option>
				<option value="author">{$t('sort_author')}</option>
			</select>
		</div>
	</div>

	{#if loading}
		<div style="text-align:center;padding:70px;color:var(--ink-faint)">…</div>
	{:else if error}
		<div style="color:var(--oxblood)">{error}</div>
	{:else if filtered.length === 0}
		<div style="text-align:center;padding:70px 20px">
			<div
				style="width:90px;height:120px;margin:0 auto 20px;border-radius:6px;border:2px dashed var(--line-strong);background:repeating-linear-gradient(135deg,transparent 0 9px,rgba(108,74,44,.05) 9px 18px)"
			></div>
			<h3 style="font-family:var(--font-display);font-size:20px;margin:0 0 6px">{$t('empty_lib_title')}</h3>
			<div style="color:var(--ink-faint);margin-bottom:18px">{$t('empty_lib_sub')}</div>
			<button class="mf-btn mf-btn--primary" onclick={() => goto('/')} style="margin:0 auto">
				<Icon name="forge" size={17} />{$t('forge_first')}
			</button>
		</div>
	{:else}
		<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:34px 28px">
			{#each filtered as book, i (book.id)}
				<div class="card-in" style="animation-delay:{Math.min(i, 12) * 45}ms">
					<div class="book-card">
						<div class="lift">
							<BookCover {book} w={180} onclick={() => goto(`/reader/${book.id}`)} />
						</div>
						<div class="quick">
							<button class="qa" title={$t('read')} onclick={() => goto(`/reader/${book.id}`)}><Icon name="read" size={16} /></button>
							<button class="qa" title={$t('edit_book')} onclick={() => goto(`/library/${book.id}`)}><Icon name="edit" size={16} /></button>
							<button class="qa" title={$t('edit_cover')} onclick={() => goto(`/cover/${book.id}`)}><Icon name="image" size={16} /></button>
							{#if book.contentHash}
								<a class="qa" title={$t('download')} href={mediaUrl(`/media/generated/${book.contentHash}/manuscript.pdf`)} download>
									<Icon name="download" size={16} />
								</a>
							{/if}
							<button class="qa" title={$t('add_shelf')} onclick={() => (addToShelfBook = book.id)}><Icon name="shelves" size={16} /></button>
							<button class="qa danger" title={$t('del')} onclick={() => remove(book.id)}><Icon name="trash" size={16} /></button>
						</div>
					</div>
					<button class="meta" onclick={() => goto(`/reader/${book.id}`)}>
						<div class="bt">{book.title}</div>
						<div class="ba">{$t('by')} {book.author}</div>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if addToShelfBook}
	<AddToShelfModal bookId={addToShelfBook} onclose={() => (addToShelfBook = null)} />
{/if}

<style>
	.card-in {
		animation: card-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes card-in {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
	}
	.book-card {
		position: relative;
	}
	/* hover lift on the cover, with a soft cast shadow underneath */
	.lift {
		position: relative;
		transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.lift::after {
		content: '';
		position: absolute;
		left: 8%;
		right: 8%;
		bottom: -8px;
		height: 16px;
		border-radius: 50%;
		background: rgba(40, 28, 14, 0.22);
		filter: blur(6px);
		opacity: 0.5;
		transition: opacity 0.22s ease;
		z-index: -1;
	}
	.book-card:hover .lift,
	.book-card:focus-within .lift {
		transform: translateY(-6px);
	}
	.book-card:hover .lift::after,
	.book-card:focus-within .lift::after {
		opacity: 0.9;
	}
	.quick {
		position: absolute;
		top: 10px;
		right: 10px;
		display: grid;
		gap: 7px;
		opacity: 0;
		transform: translateX(6px);
		transition:
			opacity 0.18s ease,
			transform 0.18s ease;
		pointer-events: none;
	}
	.book-card:hover .quick,
	.book-card:focus-within .quick {
		opacity: 1;
		transform: none;
		pointer-events: auto;
	}
	.qa {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 8px;
		cursor: pointer;
		border: 1px solid var(--line);
		background: rgba(250, 245, 234, 0.95);
		color: var(--ink-soft);
		box-shadow: var(--shadow-sm);
		transition:
			background 0.15s ease,
			color 0.15s ease;
		text-decoration: none;
	}
	.qa:hover {
		background: #fff;
		color: var(--oxblood);
	}
	.qa.danger {
		color: var(--oxblood);
	}
	.meta {
		display: block;
		width: 100%;
		margin-top: 14px;
		padding: 0;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
	}
	.bt {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 16px;
		line-height: 1.2;
		color: var(--ink);
		transition: color 0.15s ease;
	}
	.meta:hover .bt {
		color: var(--oxblood);
	}
	.ba {
		font-size: 13.5px;
		color: var(--ink-faint);
		margin-top: 3px;
	}
</style>
