import type { FontStyle, ManuscriptSettings } from './types';

/** Asset entry from /assets/manuscript/manifest.json. */
export interface AssetItem {
	id: string;
	output: string;
	width?: number;
	height?: number;
}
export interface AssetManifest {
	groups: Record<string, AssetItem[]>;
}

export const imageLimitOptions = [0, 1, 2, 3, 4, 6, 8];

export const chapterStartOptions: Array<{ value: ManuscriptSettings['chapterStart']; key: string }> = [
	{ value: 'auto', key: 'chapterAuto' },
	{ value: 'newPage', key: 'chapterNewPage' },
	{ value: 'inline', key: 'chapterInline' }
];

export interface FontOption {
	value: FontStyle;
	label: string;
	description: string;
	family: string;
	preview: 'latin' | 'ru';
	/** Custom font files that may not be present; verified via HEAD before showing. */
	assetPath?: string;
}

export const fontOptions: FontOption[] = [
	{ value: 'garamond', label: 'EB Garamond', description: 'Readable literary manuscript', family: '"Forge EB Garamond", Georgia, serif', preview: 'latin' },
	{ value: 'monomakh', label: 'Monomakh Unicode', description: 'Old Slavic display hand', family: '"Forge Monomakh", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'ponomar', label: 'Ponomar Unicode', description: 'Church Slavonic book hand', family: '"Forge Ponomar", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'menaion', label: 'Menaion Unicode', description: 'Liturgical manuscript texture', family: '"Forge Menaion", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'fedorovsk', label: 'Fedorovsk Unicode', description: 'Printed old Cyrillic tone', family: '"Forge Fedorovsk", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'ruslan', label: 'Ruslan Display', description: 'Decorative old-script Cyrillic and Latin', family: '"Forge Ruslan", "Forge EB Garamond", serif', preview: 'ru' },
	{ value: 'uncial', label: 'Uncial Antiqua', description: 'Latin uncial manuscript hand', family: '"Forge Uncial Antiqua", "Forge EB Garamond", serif', preview: 'latin' },
	{ value: 'almendra', label: 'Almendra Display', description: 'Latin fantasy calligraphic display', family: '"Forge Almendra Display", "Forge EB Garamond", serif', preview: 'latin' },
	{ value: 'festus', label: 'Festus', description: 'Latin medieval display hand', family: '"Forge Festus", "Forge EB Garamond", serif', preview: 'latin', assetPath: '/assets/manuscript/fonts/festus.ttf' },
	{ value: 'calligrapher', label: 'Calligrapher', description: 'Latin calligraphic manuscript hand', family: '"Forge Calligrapher", "Forge EB Garamond", serif', preview: 'latin', assetPath: '/assets/manuscript/fonts/calligrapher-regular.ttf' }
];

export function fontFamilyFor(style: FontStyle): string {
	return fontOptions.find((f) => f.value === style)?.family ?? fontOptions[0].family;
}

/** Human-readable name derived from an asset's output filename. */
export function assetName(item?: AssetItem): string {
	if (!item) return '';
	return (
		item.output
			.split('/')
			.pop()
			?.replace(/\.(png|jpg|jpeg|webp)$/i, '')
			.replace(/^(paper|marginOrnaments|dividers|dropcaps)-\d+-/i, '')
			.replace(/-/g, ' ') ?? item.id
	);
}

/** Backdrop colour behind a transparent illuminated drop-cap frame. */
export function dropcapBackground(dropcapPath: string): string {
	const n = dropcapPath.toLowerCase();
	if (n.includes('aged-ink')) return '#182235';
	if (n.includes('cintric')) return '#102b61';
	if (n.includes('herbal')) return '#183a22';
	if (n.includes('royal2')) return '#0e2e73';
	if (n.includes('royal')) return '#6d120c';
	if (n.includes('slavic')) return '#120f0b';
	if (n.includes('vine')) return '#d5aa46';
	if (n.includes('blue')) return '#123044';
	if (n.includes('dark') || n.includes('woodcut')) return '#1f1712';
	return '#5a150d';
}

/** Ink colour theme that adapts to dark vs light paper. */
export function inkThemeForPaper(paperPath: string): { ink: string; fadedInk: string; red: string } {
	const n = paperPath.toLowerCase();
	if (n.includes('dark') || n.includes('stained-alchemist')) {
		return { ink: '#f5dfaf', fadedInk: '#e0bd7b', red: '#ffd08a' };
	}
	return { ink: '#241105', fadedInk: '#553217', red: '#7a170f' };
}

export const assetSettingKeys = ['paper', 'ornament', 'divider', 'titleDivider', 'dropcap'] as const;

/** Loads the asset manifest from /static. */
export async function loadManifest(): Promise<AssetManifest | null> {
	try {
		const res = await fetch('/assets/manuscript/manifest.json');
		if (!res.ok) return null;
		return (await res.json()) as AssetManifest;
	} catch {
		return null;
	}
}
