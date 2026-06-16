import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { ManuscriptSettings } from './types';

/** Defaults restored from the original app (asset-based manuscript settings). */
export const DEFAULT_SETTINGS: ManuscriptSettings = {
	imageLimit: 0,
	chapterStart: 'auto',
	paper: '/assets/manuscript/papers/paper-02-burnt-edge-parchment-subtle2.jpg',
	ornament: '/assets/manuscript/marginOrnaments/marginOrnaments-09-ivy-vine-with-red-berries.png',
	divider: '/assets/manuscript/dividers/dividers-04-red-and-gold-gothic-divider.png',
	titleDivider: '/assets/manuscript/dividers/dividers-05-simple-gold-ink-flourish.png',
	dropcap: '/assets/manuscript/dropcaps/dropcaps-03-red-gold-illuminated-initial-frame.png',
	fontStyle: 'garamond'
};

/** App-wide manuscript settings (Forge + Settings share this). */
export const settings = writable<ManuscriptSettings>({ ...DEFAULT_SETTINGS });

function persistedWritable<T>(key: string, fallback: T) {
	let initial = fallback;
	if (browser) {
		try {
			initial = JSON.parse(sessionStorage.getItem(key) ?? 'null') ?? fallback;
		} catch {
			initial = fallback;
		}
	}
	const store = writable<T>(initial);
	store.subscribe((value) => {
		if (browser) sessionStorage.setItem(key, JSON.stringify(value));
	});
	return store;
}

export const SAMPLE_MD = `# The Road Beneath the Elder Moon

The caravan reached the old bridge at dusk, when the river below had turned black as poured ink.

## The Broken Toll

Mara found the tollkeeper's ledger nailed shut with a silver thorn. Inside were seven names, each written in a different hand.

## A Map of Ash

Beyond the bridge lay the barrow-road, the ruined watchfires, and the pass no king had claimed for a hundred winters.`;

export const forgeMarkdown = persistedWritable('mf:forge-markdown', SAMPLE_MD);
export const forgeTab = persistedWritable<'md' | 'upload'>('mf:forge-tab', 'md');
