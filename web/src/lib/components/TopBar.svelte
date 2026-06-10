<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { auth, currentUser } from '$lib/api';
	import Icon from './Icon.svelte';
	import Monogram from './Monogram.svelte';
	import LangSwitch from './LangSwitch.svelte';

	const tabs: Array<[string, string, string]> = [
		['/', 'forge', 'nav_forge'],
		['/library', 'library', 'nav_library'],
		['/shelves', 'shelves', 'nav_shelves']
	];

	function activeKey(pathname: string): string {
		if (pathname === '/') return '/';
		if (pathname.startsWith('/library')) return '/library';
		if (pathname.startsWith('/shelves')) return '/shelves';
		return '';
	}

	let menuOpen = $state(false);
	let menuEl: HTMLDivElement | undefined = $state();

	const active = $derived(activeKey($page.url.pathname));
	const onForge = $derived($page.url.pathname === '/');

	function handleWindowClick(e: MouseEvent) {
		if (menuEl && !menuEl.contains(e.target as Node)) menuOpen = false;
	}

	function signOut() {
		auth.logout();
		menuOpen = false;
		goto('/');
	}
</script>

<svelte:window onmousedown={handleWindowClick} />

<header
	style="position:sticky;top:0;z-index:50;
		background:linear-gradient(180deg,rgba(250,245,234,.96),rgba(247,240,225,.9));
		backdrop-filter:blur(10px);border-bottom:1px solid var(--line)"
>
	<div
		style="max-width:1320px;margin:0 auto;padding:11px 26px;display:flex;align-items:center;gap:20px"
	>
		<button
			onclick={() => goto('/')}
			style="display:flex;align-items:center;gap:12px;border:none;background:none;padding:0;cursor:pointer;text-align:left"
		>
			<Monogram />
			<div class="brand-words">
				<div
					style="font-family:var(--font-display);font-weight:700;font-size:18px;letter-spacing:.02em;line-height:1"
				>
					Manuscript&nbsp;Forge
				</div>
				<div style="font-size:12.5px;color:var(--ink-faint);margin-top:3px">{$t('tagline')}</div>
			</div>
		</button>

		<div style="flex:1"></div>

		<nav
			style="display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--paper-deep);border:1px solid var(--line)"
		>
			{#each tabs as [href, icon, label]}
				<button
					onclick={() => goto(href)}
					aria-current={active === href ? 'page' : undefined}
					style="display:flex;align-items:center;gap:8px;border:none;cursor:pointer;
						padding:8px 16px;border-radius:9px;font-size:15px;font-weight:600;
						font-family:var(--font-chrome);white-space:nowrap;
						background:{active === href ? 'var(--paper-card)' : 'transparent'};
						color:{active === href ? 'var(--oxblood)' : 'var(--ink-soft)'};
						box-shadow:{active === href ? 'var(--shadow-sm)' : 'none'}"
				>
					<Icon name={icon} size={17} />{$t(label)}
				</button>
			{/each}
		</nav>

		<div style="flex:1"></div>

		{#if onForge}
			<button class="mf-btn" onclick={() => goto('/settings')}>
				<Icon name="settings" size={16} /><span class="hide-sm">{$t('settings')}</span>
			</button>
		{/if}

		<LangSwitch />

		{#if !$currentUser}
			<button class="mf-btn" onclick={() => goto('/signin')}>
				<Icon name="user" size={16} />{$t('signin')}
			</button>
		{:else}
			<div bind:this={menuEl} style="position:relative">
				<button
					class="mf-btn mf-btn--ghost"
					onclick={() => (menuOpen = !menuOpen)}
					style="gap:7px;padding:6px 8px"
				>
					<span
						style="width:30px;height:30px;border-radius:100px;display:grid;place-items:center;
							background:linear-gradient(150deg,var(--oxblood-soft),var(--oxblood-deep));color:#f0dcc0;
							font-family:var(--font-display);font-weight:700;font-size:14px"
					>
						{($currentUser.displayName || $currentUser.email).charAt(0).toUpperCase()}
					</span>
					<Icon name="chevD" size={14} style="color:var(--ink-faint)" />
				</button>
				{#if menuOpen}
					<div
						class="mf-card mf-fade"
						style="position:absolute;right:0;top:calc(100% + 8px);width:220px;padding:8px;z-index:60"
					>
						<div style="padding:8px 10px 10px;border-bottom:1px solid var(--line)">
							<div style="font-weight:600">{$currentUser.displayName}</div>
							<div style="font-size:13px;color:var(--ink-faint)">{$currentUser.email}</div>
						</div>
						<button class="menu-row" onclick={() => { menuOpen = false; goto('/library'); }}>
							<Icon name="library" size={16} />{$t('nav_library')}
						</button>
						<button class="menu-row" onclick={signOut}>
							<Icon name="close" size={16} />{$t('signout')}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</header>
