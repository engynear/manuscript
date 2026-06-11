import type { Book, Palette } from './types';

/** Cloth + leather book palettes, ported from the prototype data.js. */
export const PALETTES: Palette[] = [
	{ spine: '#732030', fg: '#e8c9a0', foil: '#c9a456' },
	{ spine: '#2f4632', fg: '#d9c79a', foil: '#bfa14e' },
	{ spine: '#27324a', fg: '#cdb793', foil: '#b6985a' },
	{ spine: '#234945', fg: '#d6c69a', foil: '#bfa14e' },
	{ spine: '#42263f', fg: '#d8bfa0', foil: '#c2a05a' },
	{ spine: '#8a4423', fg: '#f0d6ad', foil: '#caa260' },
	{ spine: '#9a7b3f', fg: '#3a2c12', foil: '#5a4012' },
	{ spine: '#3b4148', fg: '#cdbf9f', foil: '#b09a62' },
	{ spine: '#5a1f2b', fg: '#e2c39a', foil: '#c6a256' },
	{ spine: '#23201d', fg: '#cbb88f', foil: '#a98f57' }
];

function hashString(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
}

/** Returns the book's stored palette, or a deterministic one derived from its id. */
export function paletteFor(book: Pick<Book, 'id' | 'cover'>): Palette {
	if (book.cover?.palette?.spine) return book.cover.palette;
	return PALETTES[hashString(book.id || '') % PALETTES.length];
}

export function spineTextFor(book: Pick<Book, 'title' | 'cover'>): string {
	return book.cover?.spineText || book.title;
}
