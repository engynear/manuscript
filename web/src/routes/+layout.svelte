<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { auth } from '$lib/api';
	import TopBar from '$lib/components/TopBar.svelte';

	let { children } = $props();

	// Immersive routes (Reader, public Shared) render without the app shell.
	const immersive = $derived(
		$page.url.pathname.startsWith('/reader') || $page.url.pathname.startsWith('/s/')
	);

	onMount(() => {
		// Restore the session from a stored token, if any.
		auth.me();
	});
</script>

{#if !immersive}
	<TopBar />
{/if}

<main
	class={immersive ? '' : 'paper-grain'}
	style="min-height:{immersive ? '100vh' : 'calc(100vh - 64px)'}"
>
	{@render children()}
</main>
