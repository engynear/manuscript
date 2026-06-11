export interface User {
	id: string;
	email: string;
	displayName: string;
	createdAt: string;
}

export interface AuthResponse {
	token: string;
	user: User;
}

/** A spine/cover palette (cloth + leather book colours). */
export interface Palette {
	spine: string;
	fg: string;
	foil: string;
}

export interface Cover {
	palette?: Palette;
	spineText?: string;
	artUrl?: string | null;
}

export type FontStyle =
	| 'garamond'
	| 'monomakh'
	| 'ponomar'
	| 'menaion'
	| 'fedorovsk'
	| 'ruslan'
	| 'uncial'
	| 'almendra'
	| 'festus'
	| 'calligrapher';

/**
 * Rich manuscript settings (asset-based), restored from the original app and
 * adapted to the new UI. Values are public asset paths under /assets/manuscript.
 */
export interface ManuscriptSettings {
	imageLimit: number;
	chapterStart: 'auto' | 'newPage' | 'inline';
	paper: string;
	ornament: string;
	divider: string;
	titleDivider: string;
	dropcap: string;
	fontStyle: FontStyle;
}

export interface Book {
	id: string;
	userId?: string;
	title: string;
	titleRu?: string;
	author: string;
	subtitle?: string | null;
	year?: number | null;
	settings: ManuscriptSettings;
	cover: Cover;
	sourceMarkdown?: string;
	pageCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface Shelf {
	id: string;
	userId?: string;
	name: string;
	nameRu?: string;
	position: number;
	createdAt?: string;
	books: string[]; // ordered book ids
}

export interface Share {
	id?: string;
	shelfId?: string;
	token: string;
	allowDownloads: boolean;
	revoked: boolean;
}

export interface PublicShelf {
	shelf: Shelf;
	books: Book[];
	allowDownloads: boolean;
	ownerName: string;
}

/** A section of the AI-produced manuscript plan. */
export interface PlanSection {
	id: string;
	level: number;
	originalHeading: string;
	displayHeading: string;
	bodyMarkdown: string;
	dropCap: boolean;
	ornament: boolean;
	illustration: {
		type: string;
		placement: 'before' | 'after';
		prompt: string;
		caption: string;
	} | null;
}

export interface ManuscriptPlan {
	title: string;
	subtitle: string;
	style: string;
	sections: PlanSection[];
}

/** NDJSON progress event streamed by /api/plan and /api/images. */
export interface ProgressEvent {
	type: 'progress' | 'done' | 'error';
	step?: string;
	message?: string;
	progress?: number;
	result?: unknown;
}
