<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { books as booksApi, currentUser } from '$lib/api';
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

	onMount(() => {
		if (!$currentUser) {
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
			{#each filtered as book (book.id)}
				<div>
					<div style="position:relative" class="book-card">
						<BookCover {book} w={180} onclick={() => goto(`/reader/${book.id}`)} />
						<div class="quick" style="position:absolute;top:10px;right:10px;display:grid;gap:7px">
							<button class="qa" title={$t('read')} onclick={() => goto(`/reader/${book.id}`)}><Icon name="read" size={16} /></button>
							<button class="qa" title={$t('add_shelf')} onclick={() => (addToShelfBook = book.id)}><Icon name="shelves" size={16} /></button>
							<button class="qa danger" title={$t('del')} onclick={() => remove(book.id)}><Icon name="trash" size={16} /></button>
						</div>
					</div>
					<div style="margin-top:14px">
						<div style="font-family:var(--font-display);font-weight:600;font-size:16px;line-height:1.2">{book.title}</div>
						<div style="font-size:13.5px;color:var(--ink-faint);margin-top:3px">{$t('by')} {book.author}</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if addToShelfBook}
	<AddToShelfModal bookId={addToShelfBook} onclose={() => (addToShelfBook = null)} />
{/if}

<style>
	.quick {
		opacity: 0;
		transition: opacity 0.18s;
	}
	.book-card:hover .quick,
	.book-card:focus-within .quick {
		opacity: 1;
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
	}
	.qa.danger {
		color: var(--oxblood);
	}
</style>
