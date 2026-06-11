<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { auth, ApiError } from '$lib/api';
	import Icon from '$lib/components/Icon.svelte';
	import Monogram from '$lib/components/Monogram.svelte';

	let mode = $state<'login' | 'register'>('login');
	let email = $state('');
	let password = $state('');
	let displayName = $state('');
	let busy = $state(false);
	let error = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			if (mode === 'register') await auth.register(email, password, displayName);
			else await auth.login(email, password);
			goto('/library');
		} catch (err) {
			error = err instanceof ApiError ? err.message : 'Something went wrong';
		} finally {
			busy = false;
		}
	}
</script>

<div
	style="position:fixed;inset:0;z-index:110;background:rgba(38,28,16,.5);backdrop-filter:blur(4px);display:grid;place-items:center;padding:24px"
	class="mf-fade"
>
	<div
		class="mf-card mf-fade-up"
		role="dialog"
		aria-modal="true"
		style="width:min(420px,96vw);overflow:hidden;background:var(--paper-card)"
	>
		<div
			style="padding:30px 32px 26px;text-align:center;background:linear-gradient(180deg,#faf5ea,var(--paper-deep));border-bottom:1px solid var(--line)"
		>
			<Monogram size={48} />
			<h2 style="font-family:var(--font-display);font-size:23px;margin:16px 0 6px">
				{$t('signin_title')}
			</h2>
			<div style="font-size:14.5px;color:var(--ink-faint);line-height:1.5">{$t('signin_sub')}</div>
		</div>

		<form style="padding:28px" onsubmit={submit}>
			<div style="display:flex;gap:6px;margin-bottom:18px">
				{#each [['login', $t('signin')], ['register', $t('continue')]] as [k, label]}
					<button
						type="button"
						onclick={() => (mode = k as 'login' | 'register')}
						style="flex:1;border:none;padding:8px;border-radius:8px;font-weight:600;cursor:pointer;
							background:{mode === k ? 'var(--paper-deep)' : 'transparent'};
							color:{mode === k ? 'var(--ink)' : 'var(--ink-faint)'}">{label}</button
					>
				{/each}
			</div>

			{#if mode === 'register'}
				<label style="display:block;margin-bottom:14px">
					<div
						style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:7px"
					>
						{$t('account')}
					</div>
					<input
						bind:value={displayName}
						placeholder="Mistress Quell"
						style="width:100%;padding:11px 13px;border-radius:9px;border:1px solid var(--line-strong);background:var(--paper-edge);font-size:15px;outline:none"
					/>
				</label>
			{/if}

			<label style="display:block;margin-bottom:14px">
				<div
					style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:7px"
				>
					{$t('email')}
				</div>
				<input
					type="email"
					bind:value={email}
					required
					placeholder="quell@manuscript.me"
					style="width:100%;padding:11px 13px;border-radius:9px;border:1px solid var(--line-strong);background:var(--paper-edge);font-size:15px;outline:none"
				/>
			</label>

			<label style="display:block;margin-bottom:14px">
				<div
					style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-soft);margin-bottom:7px"
				>
					{$t('password')}
				</div>
				<input
					type="password"
					bind:value={password}
					required
					minlength={8}
					placeholder="••••••••"
					style="width:100%;padding:11px 13px;border-radius:9px;border:1px solid var(--line-strong);background:var(--paper-edge);font-size:15px;outline:none"
				/>
			</label>

			{#if error}
				<div style="color:var(--oxblood);font-size:13.5px;margin-bottom:12px">{error}</div>
			{/if}

			<button
				class="mf-btn mf-btn--primary"
				type="submit"
				disabled={busy}
				style="width:100%;justify-content:center;margin-bottom:14px"
			>
				{busy ? '…' : $t('continue')}
			</button>
			<button
				class="mf-btn mf-btn--ghost"
				type="button"
				onclick={() => goto('/')}
				style="width:100%;justify-content:center;color:var(--ink-faint)"
			>
				<Icon name="chevL" size={15} />{$t('skip')}
			</button>
		</form>
	</div>
</div>
