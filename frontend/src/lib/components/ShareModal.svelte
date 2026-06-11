<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { shares as sharesApi } from '$lib/api';
	import type { Share, Shelf } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';

	let { shelf, onclose }: { shelf: Shelf; onclose: () => void } = $props();

	let share = $state<Share | null>(null);
	let copied = $state(false);
	let busy = $state(false);

	const link = $derived(
		share ? `${typeof location !== 'undefined' ? location.origin : ''}/s/${share.token}` : ''
	);
	const shared = $derived(!!share && !share.revoked);

	async function load() {
		try {
			share = await sharesApi.get(shelf.id);
		} catch {
			share = null;
		}
	}

	async function enable() {
		busy = true;
		try {
			share = await sharesApi.create(shelf.id);
		} finally {
			busy = false;
		}
	}

	async function toggleShared() {
		if (!share) return enable();
		busy = true;
		try {
			share = await sharesApi.update(shelf.id, share.allowDownloads, !share.revoked);
		} finally {
			busy = false;
		}
	}

	async function toggleDownloads() {
		if (!share) return;
		busy = true;
		try {
			share = await sharesApi.update(shelf.id, !share.allowDownloads, share.revoked);
		} finally {
			busy = false;
		}
	}

	async function regenerate() {
		busy = true;
		try {
			share = await sharesApi.regenerate(shelf.id);
		} finally {
			busy = false;
		}
	}

	function copy() {
		navigator.clipboard?.writeText(link);
		copied = true;
		setTimeout(() => (copied = false), 1800);
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
		class="mf-card mf-fade-up"
		style="width:min(460px,96vw);padding:28px;background:var(--paper-card)"
	>
		<div style="display:flex;align-items:start;justify-content:space-between;margin-bottom:6px">
			<div>
				<div class="eyebrow">{$t('share')}</div>
				<h2 style="font-family:var(--font-display);font-size:22px;margin:4px 0 2px">{$t('share_title')}</h2>
			</div>
			<button class="mf-btn mf-btn--ghost" onclick={onclose} style="padding:6px"><Icon name="close" size={18} /></button>
		</div>
		<div style="font-size:14px;color:var(--ink-faint);margin-bottom:18px">{$t('share_sub')}</div>

		<div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:10px;background:var(--paper-deep);margin-bottom:14px">
			<span style="width:38px;height:38px;border-radius:8px;background:var(--leather);display:grid;place-items:center;color:var(--gilt-soft)"><Icon name="shelves" size={18} /></span>
			<div style="flex:1">
				<div style="font-family:var(--font-display);font-weight:600">{shelf.name}</div>
				<div style="font-size:12.5px;color:{shared ? 'var(--oxblood)' : 'var(--ink-faint)'}">
					{shared ? $t('shared_status_on') : $t('shared_status_off')} · {shelf.books.length} {$t('books_count')}
				</div>
			</div>
			<button
				onclick={toggleShared}
				disabled={busy}
				aria-pressed={shared}
				style="width:46px;height:26px;border-radius:100px;border:none;cursor:pointer;position:relative;background:{shared ? 'var(--oxblood)' : 'var(--line-strong)'}"
			>
				<span style="position:absolute;top:3px;left:{shared ? 23 : 3}px;width:20px;height:20px;border-radius:100px;background:#fff;transition:left .2s;box-shadow:var(--shadow-sm)"></span>
			</button>
		</div>

		{#if shared && share}
			<div style="display:flex;gap:8px;margin-bottom:16px">
				<div
					style="flex:1;display:flex;align-items:center;gap:8px;padding:10px 13px;border-radius:9px;border:1px solid var(--line-strong);background:var(--paper-edge);font-family:var(--font-mono);font-size:13px;color:var(--ink-soft);overflow:hidden"
				>
					<Icon name="link" size={15} style="flex:0 0 auto;color:var(--ink-faint)" />
					<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{link}</span>
				</div>
				<button class="mf-btn mf-btn--primary" onclick={copy}>
					<Icon name={copied ? 'check' : 'link'} size={16} />{copied ? $t('copied') : $t('copy_link')}
				</button>
			</div>
			<label style="display:flex;align-items:center;gap:10px;padding:10px 0;cursor:pointer;font-size:14.5px">
				<button
					onclick={toggleDownloads}
					disabled={busy}
					aria-pressed={share.allowDownloads}
					style="width:40px;height:23px;border-radius:100px;border:none;cursor:pointer;position:relative;background:{share.allowDownloads ? 'var(--gilt)' : 'var(--line-strong)'}"
				>
					<span style="position:absolute;top:3px;left:{share.allowDownloads ? 20 : 3}px;width:17px;height:17px;border-radius:100px;background:#fff;transition:left .2s"></span>
				</button>
				{$t('allow_dl')}
			</label>
			<div style="display:flex;gap:10px;margin-top:16px;border-top:1px solid var(--line);padding-top:16px">
				<button class="mf-btn mf-btn--ghost" onclick={regenerate} disabled={busy}><Icon name="forge" size={15} />{$t('regen_link')}</button>
				<div style="flex:1"></div>
				<a class="mf-btn" href={`/s/${share.token}`} target="_blank" rel="noopener">{$t('read')}</a>
			</div>
		{/if}
	</div>
</div>
