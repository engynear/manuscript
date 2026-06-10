import { writable } from 'svelte/store';
import type { ManuscriptSettings } from './types';

export const DEFAULT_SETTINGS: ManuscriptSettings = {
	paper: 'aged',
	font: 'EB Garamond',
	divider: 'fleuron',
	dropcap: true,
	ornament: 'vine',
	tint: '#f3ead4',
	handwritten: false
};

/** App-wide manuscript settings (Forge + Settings modal share this). */
export const settings = writable<ManuscriptSettings>({ ...DEFAULT_SETTINGS });

export const SAMPLE_MD = `# The Road Beneath the Elder Moon

The caravan reached the old bridge at dusk, when the river below had turned black as poured ink.

## The Broken Toll

Mara found the tollkeeper's ledger nailed shut with a silver thorn. Inside were seven names, each written in a different hand.

## A Map of Ash

Beyond the bridge lay the barrow-road, the ruined watchfires, and the pass no king had claimed for a hundred winters.`;
