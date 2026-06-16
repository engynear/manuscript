<script lang="ts">
	import type { ManuscriptSettings } from '$lib/types';
	import { fontFamilyFor, dropcapBackground, inkThemeForPaper } from '$lib/manuscript';
	import { t, lang } from '$lib/i18n';

	let { settings: s }: { settings: ManuscriptSettings } = $props();

	const family = $derived(fontFamilyFor(s.fontStyle));
	const ink = $derived(inkThemeForPaper(s.paper));
	const fs = $derived(s.fontSize ?? 20);
	const dropLetter = $derived($lang === 'ru' ? 'Б' : 'T');
</script>

<div
	style="position:relative;margin:0 auto;width:100%;max-width:330px;aspect-ratio:0.707/1;max-height:560px;
		overflow:hidden;background-image:url({s.paper});background-size:cover;background-position:center;
		font-family:{family};box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)"
>
	<div
		style="position:absolute;inset:0;background:radial-gradient(circle at 50% 36%,rgba(255,245,210,.16),transparent 43%),linear-gradient(90deg,rgba(68,33,13,.18),transparent 14%,transparent 86%,rgba(68,33,13,.16))"
	></div>

	{#if s.ornament}
		<img
			src={s.ornament}
			alt=""
			style="position:absolute;left:16px;top:48px;height:72%;width:54px;object-fit:contain;object-position:top;opacity:.95"
		/>
	{/if}

	<div
		style="position:relative;z-index:1;display:flex;flex-direction:column;height:100%;padding:48px 40px 40px 96px;color:{ink.ink}"
	>
		<h4 style="margin:0;text-align:center;font-size:{Math.round(fs * 1.3)}px;font-weight:700;line-height:1.1;color:{ink.red}">
			{$t('sample_heading')}
		</h4>
		{#if s.titleDivider}
			<img src={s.titleDivider} alt="" style="margin:12px auto 0;height:30px;width:70%;object-fit:contain" />
		{/if}

		<div style="margin-top:22px;display:flex;align-items:flex-start;gap:12px">
			<span
				style="position:relative;display:grid;place-items:center;width:58px;height:58px;flex:0 0 auto;overflow:hidden;
					background-color:{dropcapBackground(s.dropcap)};color:#fff4d6;font-size:40px;font-weight:700;line-height:1"
			>
				<img src={s.dropcap} alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
				<span style="position:relative;z-index:1">{dropLetter}</span>
			</span>
			<p style="margin:0;font-size:{Math.max(13, Math.round(fs * 0.75))}px;line-height:1.55">{$t('sample_line')}</p>
		</div>

		{#if s.divider}
			<img src={s.divider} alt="" style="margin:26px auto 0;height:36px;width:65%;object-fit:contain" />
		{/if}

		<div
			style="margin-top:auto;border-top:1px solid rgba(122,90,46,.35);padding-top:14px;text-align:center;font-size:12px;font-style:italic;color:{ink.fadedInk}"
		>
			{$t('sample_caption')}
		</div>
	</div>
</div>
