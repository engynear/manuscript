<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { settings, forgeMarkdown, forgeTab } from '$lib/settings';
	import { auth, currentUser, books as booksApi, streamNDJSON } from '$lib/api';
	import Icon from '$lib/components/Icon.svelte';
	import ManuscriptPages from '$lib/components/ManuscriptPages.svelte';

	type GenerateResult = {
		hash: string;
		title: string;
		subtitle?: string;
		previewHtml: string;
		pdfUrl: string;
		imageFailures: number;
	};

	let phase = $state<'empty' | 'forging' | 'done'>('empty');
	let pct = $state(0);
	let progressMessage = $state('');
	let progressLog = $state<string[]>([]);
	let result = $state<GenerateResult | null>(null);
	let error = $state('');
	const lineCount = $derived($forgeMarkdown.split('\n').length);

	async function generate() {
		const user = $currentUser ?? (await auth.me());
		if (!user) {
			goto('/signin');
			return;
		}
		phase = 'forging';
		pct = 0;
		progressMessage = $t('generating');
		progressLog = [];
		result = null;
		error = '';
		try {
			await streamNDJSON('/api/generate', { markdown: $forgeMarkdown, settings: $settings }, (event) => {
				if (typeof event.progress === 'number') pct = event.progress;
				if (event.message) {
					progressMessage = event.message;
					progressLog = [...progressLog.slice(-4), event.message];
				}
				if (event.type === 'error') {
					throw new Error(event.message || 'Generation failed');
				}
				if (event.type === 'done' && event.result) {
					result = event.result as GenerateResult;
					phase = 'done';
					pct = 100;
				}
			});
			if (!result) {
				throw new Error('Generation finished without a result');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Generation failed';
			phase = 'empty';
		}
	}

	async function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const f = input.files?.[0];
		if (f) {
			$forgeMarkdown = await f.text();
			$forgeTab = 'md';
		}
	}

	let saving = $state(false);

	function titleFromMd(src: string): string {
		const line = src.split('\n').find((l) => l.startsWith('# '));
		return line ? line.slice(2).trim() : 'Untitled';
	}

	async function saveToLibrary(): Promise<string | null> {
		if (!$currentUser) {
			goto('/signin');
			return null;
		}
		saving = true;
		try {
			const book = await booksApi.create({
				title: result?.title || titleFromMd($forgeMarkdown),
				author: $currentUser.displayName || '',
				sourceMarkdown: $forgeMarkdown,
				contentHash: result?.hash ?? '',
				settings: $settings,
				pageCount: $forgeMarkdown.split(/\n#{1,2}\s/).length
			});
			goto('/library');
			return book.id;
		} finally {
			saving = false;
		}
	}

	async function designCover() {
		if (!$currentUser) {
			goto('/signin');
			return;
		}
		saving = true;
		try {
			const book = await booksApi.create({
				title: result?.title || titleFromMd($forgeMarkdown),
				author: $currentUser.displayName || '',
				sourceMarkdown: $forgeMarkdown,
				contentHash: result?.hash ?? '',
				settings: $settings,
				pageCount: $forgeMarkdown.split(/\n#{1,2}\s/).length
			});
			goto(`/cover/${book.id}`);
		} finally {
			saving = false;
		}
	}

</script>

<div style="max-width:1320px;margin:0 auto;padding:26px 26px 60px">
	<div
		class="forge-grid"
		style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);gap:22px;align-items:start"
	>
		<!-- left: input -->
		<section class="mf-card mf-fade-up" style="overflow:hidden">
			<div
				style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line)"
			>
				<span
					style="width:26px;height:26px;border-radius:100px;background:var(--ink);color:var(--gilt-bright);display:grid;place-items:center;font-family:var(--font-display);font-weight:700;font-size:14px;flex:0 0 auto"
					>1</span
				>
				<div>
					<h2 style="margin:0;font-family:var(--font-display);font-size:18px">{$t('input_title')}</h2>
					<div style="font-size:13px;color:var(--ink-faint)">{$t('input_sub')}</div>
				</div>
			</div>

			<div style="display:flex;gap:6px;padding:12px 16px 0">
				{#each [['md', 'tab_md'], ['upload', 'tab_upload']] as [k, l]}
					<button
						onclick={() => ($forgeTab = k as 'md' | 'upload')}
						style="border:none;padding:7px 13px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;
							background:{$forgeTab === k ? 'var(--paper-deep)' : 'transparent'};
							color:{$forgeTab === k ? 'var(--ink)' : 'var(--ink-faint)'}">{$t(l)}</button
					>
				{/each}
			</div>

			{#if $forgeTab === 'md'}
				<div
					style="display:flex;margin:16px;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--paper-edge)"
				>
					<div
						aria-hidden="true"
						style="padding:14px 10px;text-align:right;font-family:var(--font-mono);font-size:12.5px;line-height:1.6;color:var(--ink-ghost);background:rgba(0,0,0,.025);user-select:none;min-width:38px"
					>
						{#each Array(lineCount) as _, i}
							<div>{i + 1}</div>
						{/each}
					</div>
					<textarea
						bind:value={$forgeMarkdown}
						spellcheck="false"
						style="flex:1;border:none;outline:none;resize:vertical;min-height:300px;padding:14px;font-family:var(--font-mono);font-size:13.5px;line-height:1.6;color:var(--ink);background:transparent"
					></textarea>
				</div>
			{:else}
				<label
					style="display:grid;place-items:center;gap:10px;margin:16px;padding:46px 20px;min-height:300px;border:2px dashed var(--line-strong);border-radius:10px;background:var(--paper-edge);cursor:pointer;text-align:center"
				>
					<Icon name="upload" size={30} style="color:var(--gilt)" />
					<div style="font-weight:600">{$t('tab_upload')}</div>
					<div style="font-size:13px;color:var(--ink-faint)">{$t('upload_hint')}</div>
					<input type="file" accept=".md,text/markdown" style="display:none" onchange={onFile} />
				</label>
			{/if}

			<div style="display:flex;align-items:center;gap:12px;padding:0 18px 18px">
				<span class="mf-chip">{$forgeMarkdown.length} {$t('chars')}</span>
				<span style="font-size:13px;color:var(--ink-faint)">{$t('supports_md')}</span>
				<div style="flex:1"></div>
				<button class="mf-btn" onclick={() => goto('/settings')}>
					<Icon name="settings" size={16} />{$t('settings')}
				</button>
				<button class="mf-btn mf-btn--primary" onclick={generate} disabled={phase === 'forging'}>
					<Icon name="forge" size={17} />{phase === 'forging' ? `${Math.round(pct)}%` : $t('generate')}
				</button>
			</div>
			{#if phase === 'forging'}
				<div
					class="mf-fade"
					style="margin:0 18px 18px;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.38)"
				>
					<div style="display:flex;align-items:center;gap:10px">
						<div
							style="height:7px;flex:1;border-radius:100px;overflow:hidden;background:var(--paper-deep);border:1px solid var(--line)"
						>
							<div
								style="height:100%;width:{pct}%;background:linear-gradient(90deg,var(--gilt),var(--oxblood));transition:width .25s ease"
							></div>
						</div>
						<span style="font-family:var(--font-mono);font-size:12px;color:var(--ink-soft)">{Math.round(pct)}%</span>
					</div>
					<div style="margin-top:9px;font-size:13.5px;color:var(--ink-soft)">
						{progressMessage || $t('generating')}
					</div>
				</div>
			{/if}
		</section>

		<!-- right: forged preview -->
		<section
			class="mf-card mf-fade-up"
			style="overflow:hidden;position:relative;min-height:540px;display:flex;flex-direction:column;animation-delay:80ms"
		>
			<div
				style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line)"
			>
				<span
					style="width:26px;height:26px;border-radius:100px;background:var(--ink);color:var(--gilt-bright);display:grid;place-items:center;font-family:var(--font-display);font-weight:700;font-size:14px;flex:0 0 auto"
					>2</span
				>
				<div style="flex:1">
					<h2 style="margin:0;font-family:var(--font-display);font-size:18px">{$t('forged_title')}</h2>
					<div style="font-size:13px;color:var(--ink-faint)">{$t('forged_sub')}</div>
				</div>
			</div>

			<div style="flex:1;position:relative;background:var(--paper-deep);overflow:auto;padding:22px">
				{#if phase === 'empty'}
					<div
						style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:30px"
					>
						<div>
							<div
								style="width:86px;height:116px;margin:0 auto 18px;border-radius:6px;border:2px dashed var(--line-strong);background:repeating-linear-gradient(135deg,transparent 0 8px,rgba(108,74,44,.05) 8px 16px);display:grid;place-items:center"
							>
								<Icon name="read" size={30} style="color:var(--ink-ghost)" />
							</div>
							<div style="font-family:var(--font-display);font-size:19px;color:var(--ink-soft)">
								{$t('forged_empty')}
							</div>
							<div style="font-size:14px;color:var(--ink-faint);margin-top:6px;max-width:280px">
								{$t('forged_hint')}
							</div>
						</div>
					</div>
				{:else if result}
					<iframe
						title="Manuscript preview"
						srcdoc={result.previewHtml}
						style="display:block;width:100%;max-width:100%;box-sizing:border-box;min-height:680px;border:0;background:#2b2118;border-radius:8px"
					></iframe>
				{:else}
					<div class="mf-fade-up">
						<ManuscriptPages md={$forgeMarkdown} settings={$settings} width={480} />
					</div>
				{/if}

				{#if phase === 'forging'}
					<div
						class="mf-fade"
						style="position:absolute;inset:0;background:rgba(243,234,212,.85);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding-top:46px;z-index:5"
					>
						<div style="width:min(340px,80%);text-align:center">
							<div
								style="font-family:var(--font-display);font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:var(--gilt)"
							>
								{Math.round(pct)}%
							</div>
							<div
								style="height:6px;background:var(--paper-deep);border-radius:100px;overflow:hidden;margin:12px 0 20px;border:1px solid var(--line)"
							>
								<div
									style="width:{pct}%;height:100%;background:linear-gradient(90deg,var(--gilt),var(--oxblood));transition:width .35s ease"
								></div>
							</div>
							<div style="display:grid;gap:9px;text-align:left;justify-content:center">
								{#if progressLog.length}
									{#each progressLog as st, i}
										<div
											style="display:flex;align-items:center;gap:10px;font-size:15px;color:{i === progressLog.length - 1
												? 'var(--oxblood)'
												: 'var(--ink)'};font-weight:{i === progressLog.length - 1 ? 600 : 400}"
										>
											<span
												style="width:18px;height:18px;border-radius:100px;display:grid;place-items:center;flex:0 0 auto;border:1.5px solid var(--oxblood);background:{i ===
												progressLog.length - 1
													? 'transparent'
													: 'var(--oxblood)'};color:#f0dcc0"
											>
												{#if i === progressLog.length - 1}
													<span style="width:6px;height:6px;border-radius:100px;background:var(--oxblood)"></span>
												{:else}
													<Icon name="check" size={11} stroke={2.6} />
												{/if}
											</span>
											{st}
										</div>
									{/each}
								{:else}
									<div
										style="display:flex;align-items:center;gap:10px;font-size:15px;color:var(--oxblood);font-weight:600"
									>
										<span
											style="width:18px;height:18px;border-radius:100px;display:grid;place-items:center;flex:0 0 auto;border:1.5px solid var(--oxblood)"
										>
											<span style="width:6px;height:6px;border-radius:100px;background:var(--oxblood)"></span>
										</span>
										{progressMessage}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>

			{#if error}
				<div class="mf-fade" style="padding:12px 18px;border-top:1px solid var(--line);color:var(--oxblood)">
					{error}
				</div>
			{/if}

			{#if phase === 'done'}
				<div
					class="mf-fade"
					style="display:flex;gap:10px;padding:14px 18px;border-top:1px solid var(--line);flex-wrap:wrap"
				>
					<a class="mf-btn mf-btn--primary" href={result?.pdfUrl ?? '#'} download>
						<Icon name="download" size={16} />{$t('download')}
					</a>
					<button class="mf-btn" onclick={designCover} disabled={saving}>
						<Icon name="image" size={16} />{$t('design_cover')}
					</button>
					<div style="flex:1"></div>
					<button class="mf-btn mf-btn--gilt" onclick={saveToLibrary} disabled={saving}>
						{#if $currentUser}<Icon name="check" size={16} />{/if}{$t('save_lib')}
					</button>
				</div>
			{/if}
		</section>
	</div>
</div>
