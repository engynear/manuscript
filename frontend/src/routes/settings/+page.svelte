<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { t, lang } from '$lib/i18n';
	import { settings, DEFAULT_SETTINGS } from '$lib/settings';
	import {
		type AssetManifest,
		loadManifest,
		fontOptions,
		imageLimitOptions,
		chapterStartOptions,
		assetSettingKeys
	} from '$lib/manuscript';
	import type { ManuscriptSettings } from '$lib/types';
	import Icon from '$lib/components/Icon.svelte';
	import AssetPicker from '$lib/components/AssetPicker.svelte';
	import PagePreview from '$lib/components/PagePreview.svelte';

	// Local working copy; committed to the shared store on "Apply".
	let draft = $state<ManuscriptSettings>({ ...$settings });
	let manifest = $state<AssetManifest | null>(null);
	let fontAvailable = $state<Record<string, boolean>>({});

	function group(name: string) {
		return manifest?.groups[name] ?? [];
	}
	const dividerItems = $derived(group('dividers').filter((i) => i.id !== 'dividers-01'));
	const visibleFonts = $derived(fontOptions.filter((f) => !f.assetPath || fontAvailable[f.value]));

	function set<K extends keyof ManuscriptSettings>(key: K, value: ManuscriptSettings[K]) {
		draft = { ...draft, [key]: value };
	}

	function apply() {
		settings.set({ ...draft });
		goto('/');
	}

	onMount(async () => {
		manifest = await loadManifest();
		if (manifest) {
			const available = new Set(Object.values(manifest.groups).flat().map((a) => a.output));
			for (const key of assetSettingKeys) {
				if (!available.has(draft[key])) set(key, DEFAULT_SETTINGS[key]);
			}
		}
		// Verify optional custom font files are actually present.
		const custom = fontOptions.filter((f) => f.assetPath);
		const entries = await Promise.all(
			custom.map(async (f) => {
				try {
					const r = await fetch(f.assetPath!, { method: 'HEAD' });
					return [f.value, r.ok] as const;
				} catch {
					return [f.value, false] as const;
				}
			})
		);
		fontAvailable = Object.fromEntries(entries);
	});
</script>

<div style="max-width:1180px;margin:0 auto;padding:24px 26px 60px">
	<div class="mf-card cover-grid" style="overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 360px">
		<!-- controls -->
		<div style="padding:24px 26px;min-height:0;overflow:auto;max-height:80vh">
			<div style="margin-bottom:18px">
				<div class="eyebrow">{$t('settings')}</div>
				<h1 style="margin:4px 0 2px;font-family:var(--font-display);font-size:26px">{$t('settings_title')}</h1>
				<div style="font-size:14px;color:var(--ink-faint)">{$t('settings_sub')}</div>
			</div>

			<!-- illustration count -->
			<section style="padding:8px 0 18px">
				<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:10px">
					<div>
						<h3 style="margin:0;font-family:var(--font-display);font-size:16px">{$t('set_images')}</h3>
						<p style="margin:2px 0 0;font-size:13px;color:var(--ink-faint)">{$t('set_images_sub')}</p>
					</div>
					<span style="font-weight:700;color:var(--oxblood)">{draft.imageLimit}</span>
				</div>
				<div style="display:flex;flex-wrap:wrap;gap:8px">
					{#each imageLimitOptions as count}
						<button
							onclick={() => set('imageLimit', count)}
							style="min-width:46px;padding:8px 12px;border-radius:8px;font-weight:700;cursor:pointer;
								border:{draft.imageLimit === count ? '1px solid var(--oxblood)' : '1px solid var(--line-strong)'};
								background:{draft.imageLimit === count ? 'var(--oxblood)' : 'var(--paper-edge)'};
								color:{draft.imageLimit === count ? '#fff4d6' : 'var(--ink)'}">{count}</button
						>
					{/each}
				</div>
			</section>

			<!-- chapter starts -->
			<section style="border-top:1px solid var(--line);padding:18px 0">
				<h3 style="margin:0;font-family:var(--font-display);font-size:16px">{$t('set_chapter')}</h3>
				<p style="margin:2px 0 10px;font-size:13px;color:var(--ink-faint)">{$t('set_chapter_sub')}</p>
				<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
					{#each chapterStartOptions as opt}
						<button
							onclick={() => set('chapterStart', opt.value)}
							style="padding:10px;border-radius:8px;font-weight:700;cursor:pointer;
								border:{draft.chapterStart === opt.value
								? '1px solid var(--oxblood)'
								: '1px solid var(--line-strong)'};
								background:{draft.chapterStart === opt.value ? 'var(--oxblood)' : 'var(--paper-edge)'};
								color:{draft.chapterStart === opt.value ? '#fff4d6' : 'var(--ink)'}"
							>{$t(opt.key === 'chapterAuto' ? 'ch_auto' : opt.key === 'chapterNewPage' ? 'ch_newpage' : 'ch_inline')}</button
						>
					{/each}
				</div>
			</section>

			<!-- page size -->
			<section style="border-top:1px solid var(--line);padding:18px 0">
				<h3 style="margin:0;font-family:var(--font-display);font-size:16px">{$t('set_pagesize')}</h3>
				<p style="margin:2px 0 10px;font-size:13px;color:var(--ink-faint)">{$t('set_pagesize_sub')}</p>
				<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
					{#each [['a4', 'ps_a4'], ['letter', 'ps_letter']] as [value, key]}
						<button
							onclick={() => set('pageSize', value as ManuscriptSettings['pageSize'])}
							style="padding:10px;border-radius:8px;font-weight:700;cursor:pointer;
								border:{draft.pageSize === value
								? '1px solid var(--oxblood)'
								: '1px solid var(--line-strong)'};
								background:{draft.pageSize === value ? 'var(--oxblood)' : 'var(--paper-edge)'};
								color:{draft.pageSize === value ? '#fff4d6' : 'var(--ink)'}">{$t(key)}</button
						>
					{/each}
				</div>
			</section>

			<!-- font -->
			<section style="border-top:1px solid var(--line);padding:18px 0">
				<h3 style="margin:0;font-family:var(--font-display);font-size:16px">{$t('s_font')}</h3>
				<p style="margin:2px 0 10px;font-size:13px;color:var(--ink-faint)">{$t('set_font_sub')}</p>
				<div style="display:grid;gap:8px;margin:0 0 14px">
					<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
						<span style="font-size:13px;font-weight:700;color:var(--ink-soft)">Размер текста</span>
						<span style="font-weight:700;color:var(--oxblood)">{draft.fontSize}px</span>
					</div>
					<input
						type="range"
						min="16"
						max="24"
						step="1"
						value={draft.fontSize}
						oninput={(e) => set('fontSize', Number(e.currentTarget.value))}
					/>
				</div>
				<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
					{#each visibleFonts as font}
						<button
							onclick={() => set('fontStyle', font.value)}
							style="padding:12px;border-radius:9px;text-align:left;cursor:pointer;background:var(--paper-edge);
								border:{draft.fontStyle === font.value
								? '2px solid var(--oxblood)'
								: '1px solid var(--line-strong)'}"
						>
							<div style="font-size:14px;font-weight:700;color:var(--ink)">{font.label}</div>
							<div style="font-size:12px;color:var(--ink-faint);margin-top:2px">{font.description}</div>
							<div style="margin-top:10px;min-height:48px;color:var(--ink)" style:font-family={font.family}>
								{#if font.preview === 'ru'}
									<div style="font-size:22px;line-height:1.2">Сильмеринское Зерцало</div>
								{:else}
									<div style="font-size:22px;line-height:1.2">Manuscript Forge</div>
								{/if}
							</div>
						</button>
					{/each}
				</div>
			</section>

			<AssetPicker
				label={$t('s_paper')}
				description={$t('set_paper_sub')}
				current={draft.paper}
				items={group('papers')}
				mode="paper"
				noAssetsLabel={$t('no_assets')}
				onselect={(v) => set('paper', v)}
			/>
			<AssetPicker
				label={$t('s_ornament')}
				description={$t('set_ornament_sub')}
				current={draft.ornament}
				items={group('marginOrnaments')}
				mode="vertical"
				noAssetsLabel={$t('no_assets')}
				onselect={(v) => set('ornament', v)}
			/>
			<AssetPicker
				label={$t('s_divider')}
				description={$t('set_divider_sub')}
				current={draft.divider}
				items={dividerItems}
				mode="wide"
				noAssetsLabel={$t('no_assets')}
				onselect={(v) => set('divider', v)}
			/>
			<AssetPicker
				label={$t('set_titlediv')}
				description={$t('set_titlediv_sub')}
				current={draft.titleDivider}
				items={dividerItems}
				mode="wide"
				noAssetsLabel={$t('no_assets')}
				onselect={(v) => set('titleDivider', v)}
			/>
			<AssetPicker
				label={$t('s_dropcap')}
				description={$t('set_dropcap_sub')}
				current={draft.dropcap}
				items={group('dropcaps')}
				mode="square"
				noAssetsLabel={$t('no_assets')}
				onselect={(v) => set('dropcap', v)}
			/>
		</div>

		<!-- sticky preview -->
		<aside
			style="border-left:1px solid var(--line);background:var(--ink);color:#f8e8c2;padding:22px;display:flex;flex-direction:column;max-height:80vh;overflow:auto"
		>
			<h3 style="margin:0;font-family:var(--font-display);font-size:20px">{$t('set_preview')}</h3>
			<p style="margin:4px 0 0;font-size:13px;color:#e6cc95">{$t('set_preview_sub')}</p>

			<div style="margin-top:18px;background:var(--paper-deep);padding:12px;border-radius:8px">
				<PagePreview settings={draft} />
			</div>

			<div style="display:flex;gap:10px;margin-top:18px">
				<button class="mf-btn" onclick={() => (draft = { ...DEFAULT_SETTINGS })}>{$t('reset')}</button>
				<button class="mf-btn mf-btn--primary" onclick={apply} style="flex:1;justify-content:center">
					<Icon name="check" size={16} />{$t('set_apply')}
				</button>
			</div>
		</aside>
	</div>
</div>
