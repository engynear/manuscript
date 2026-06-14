<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { shelves as shelvesApi } from '$lib/api';
	import type { Shelf } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let { bookId, onclose }: { bookId: string; onclose: () => void } = $props();

	let shelves = $state<Shelf[]>([]);
	let busy = $state(false);

	async function load() {
		shelves = await shelvesApi.list();
	}

	async function toggle(shelf: Shelf) {
		if (busy) return;
		busy = true;
		const has = shelf.books.includes(bookId);
		const next = has ? shelf.books.filter((b) => b !== bookId) : [...shelf.books, bookId];
		try {
			const updated = await shelvesApi.setBooks(shelf.id, next);
			shelves = shelves.map((s) => (s.id === shelf.id ? updated : s));
		} finally {
			busy = false;
		}
	}

	onMount(load);
</script>

<div
	onmousedown={onclose}
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
		style="width:min(440px,96vw);max-height:80vh;display:flex;flex-direction:column;background:var(--paper-card)"
	>
		<div style="padding:20px 24px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between">
			<h2 style="font-family:var(--font-display);font-size:19px;margin:0">{$t('add_shelf')}</h2>
			<button class="mf-btn mf-btn--ghost" onclick={onclose} style="padding:6px"><Icon name="close" size={18} /></button>
		</div>
		<div style="overflow:auto;padding:12px">
			{#if shelves.length === 0}
				<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:14px">{$t('empty_shelf')}</div>
			{:else}
				<div style="display:grid;gap:4px">
					{#each shelves as shelf (shelf.id)}
						{@const on = shelf.books.includes(bookId)}
						<button class="menu-row" onclick={() => toggle(shelf)} style="gap:12px">
							<span style="width:30px;height:30px;border-radius:7px;background:var(--leather);display:grid;place-items:center;color:var(--gilt-soft)"><Icon name="shelves" size={15} /></span>
							<span style="flex:1;text-align:left"><span style="font-weight:600">{shelf.name}</span><span style="color:var(--ink-faint);font-size:13px"> · {shelf.books.length}</span></span>
							<span
								style="width:22px;height:22px;border-radius:6px;display:grid;place-items:center;color:#f0dcc0;
									border:1.5px solid {on ? 'var(--oxblood)' : 'var(--line-strong)'};background:{on ? 'var(--oxblood)' : 'transparent'}"
							>
								{#if on}<Icon name="check" size={13} stroke={3} />{/if}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<div style="padding:16px;border-top:1px solid var(--line)">
			<button class="mf-btn mf-btn--primary" onclick={onclose} style="width:100%;justify-content:center">{$t('done')}</button>
		</div>
	</div>
</div>
