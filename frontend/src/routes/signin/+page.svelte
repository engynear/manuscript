<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { auth, ApiError } from '$lib/api';
	import Icon from '$lib/components/Icon.svelte';
	import Monogram from '$lib/components/Monogram.svelte';

	let mode = $state<'signin' | 'signup'>('signin');
	let email = $state('');
	let password = $state('');
	let displayName = $state('');
	let busy = $state(false);
	let error = $state('');

	const isSignup = $derived(mode === 'signup');

	function switchMode(next: 'signin' | 'signup') {
		mode = next;
		error = '';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			if (isSignup) await auth.register(email, password, displayName);
			else await auth.login(email, password);
			goto('/library');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong';
		} finally {
			busy = false;
		}
	}
</script>

<div class="scrim">
	<div class="card mf-pop" role="dialog" aria-modal="true" aria-label={$t(isSignup ? 'signup_title' : 'signin_title')}>
		<div class="head">
			<Monogram size={46} />
			<h2 class="title">{$t(isSignup ? 'signup_title' : 'signin_title')}</h2>
			<p class="sub">{$t(isSignup ? 'signup_sub' : 'signin_sub')}</p>
		</div>

		<div class="seg" role="tablist" aria-label="Account">
			<span class="seg-glide" style="transform:translateX({isSignup ? '100%' : '0'})"></span>
			<button type="button" role="tab" aria-selected={!isSignup} class:on={!isSignup} onclick={() => switchMode('signin')}>
				{$t('signin_cta')}
			</button>
			<button type="button" role="tab" aria-selected={isSignup} class:on={isSignup} onclick={() => switchMode('signup')}>
				{$t('signup_cta')}
			</button>
		</div>

		<form onsubmit={submit}>
			{#if isSignup}
				<label class="field" style="--d:0ms">
					<span class="lbl">{$t('account')}</span>
					<input bind:value={displayName} placeholder="Mistress Quell" autocomplete="name" />
				</label>
			{/if}

			<label class="field" style="--d:40ms">
				<span class="lbl">{$t('email')}</span>
				<input type="email" bind:value={email} required placeholder="quell@manuscript.me" autocomplete="email" />
			</label>

			<label class="field" style="--d:80ms">
				<span class="lbl">{$t('password')}</span>
				<input
					type="password"
					bind:value={password}
					required
					minlength={8}
					placeholder="••••••••"
					autocomplete={isSignup ? 'new-password' : 'current-password'}
				/>
			</label>

			{#if error}
				<p class="err" role="alert">{error}</p>
			{/if}

			<button class="mf-btn mf-btn--primary submit" type="submit" disabled={busy}>
				{#if busy}
					<span class="spin" aria-hidden="true"></span>
				{:else}
					<Icon name={isSignup ? 'sparkle' : 'user'} size={16} />
				{/if}
				{$t(isSignup ? 'signup_cta' : 'signin_cta')}
			</button>

			<p class="alt">
				{$t(isSignup ? 'have_account' : 'no_account')}
				<button type="button" class="link" onclick={() => switchMode(isSignup ? 'signin' : 'signup')}>
					{$t(isSignup ? 'signin_cta' : 'signup_cta')}
				</button>
			</p>

			<button class="mf-btn mf-btn--ghost back" type="button" onclick={() => goto('/')}>
				<Icon name="chevL" size={15} />{$t('skip')}
			</button>
		</form>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 110;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(38, 28, 16, 0.5);
		backdrop-filter: blur(4px);
		animation: scrim-in 0.3s ease both;
	}
	@keyframes scrim-in {
		from {
			opacity: 0;
		}
	}
	.card {
		width: min(420px, 96vw);
		overflow: hidden;
		background: var(--paper-card);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
	}
	.mf-pop {
		animation: pop 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes pop {
		from {
			opacity: 0;
			transform: translateY(14px) scale(0.97);
		}
	}
	.head {
		padding: 30px 32px 22px;
		text-align: center;
		background: linear-gradient(180deg, #faf5ea, var(--paper-deep));
		border-bottom: 1px solid var(--line);
	}
	.title {
		font-family: var(--font-display);
		font-size: 25px;
		margin: 16px 0 6px;
		letter-spacing: 0.01em;
	}
	.sub {
		font-size: 14px;
		color: var(--ink-faint);
		line-height: 1.5;
		margin: 0;
		max-width: 30ch;
		margin-inline: auto;
	}

	/* segmented sign in / sign up */
	.seg {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0;
		margin: 22px 28px 4px;
		padding: 4px;
		border-radius: 100px;
		background: var(--paper-deep);
		border: 1px solid var(--line);
	}
	.seg-glide {
		position: absolute;
		top: 4px;
		bottom: 4px;
		left: 4px;
		width: calc(50% - 4px);
		border-radius: 100px;
		background: var(--paper-card);
		box-shadow: var(--shadow-sm);
		transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.seg button {
		position: relative;
		z-index: 1;
		border: none;
		background: none;
		padding: 9px 0;
		font-family: var(--font-chrome);
		font-size: 14.5px;
		font-weight: 600;
		color: var(--ink-faint);
		cursor: pointer;
		transition: color 0.25s ease;
	}
	.seg button.on {
		color: var(--oxblood);
	}

	form {
		padding: 18px 28px 26px;
	}
	.field {
		display: block;
		margin-bottom: 14px;
		animation: rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: var(--d, 0ms);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
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
	.field input {
		width: 100%;
		padding: 11px 13px;
		border-radius: 9px;
		border: 1px solid var(--line-strong);
		background: var(--paper-edge);
		font-size: 15px;
		color: var(--ink);
		outline: none;
		transition:
			border-color 0.18s ease,
			box-shadow 0.18s ease;
	}
	.field input:focus {
		border-color: var(--oxblood);
		box-shadow: 0 0 0 3px rgba(124, 34, 48, 0.12);
	}
	.err {
		color: var(--oxblood);
		font-size: 13.5px;
		margin: 0 0 12px;
	}
	.submit {
		width: 100%;
		justify-content: center;
		margin-top: 4px;
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
	.alt {
		text-align: center;
		font-size: 13.5px;
		color: var(--ink-faint);
		margin: 16px 0 4px;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: var(--oxblood);
		cursor: pointer;
		text-underline-offset: 3px;
	}
	.link:hover {
		text-decoration: underline;
	}
	.back {
		width: 100%;
		justify-content: center;
		color: var(--ink-faint);
	}
</style>
