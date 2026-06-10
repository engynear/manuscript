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
	palette: Palette;
	spineText: string;
	artUrl?: string | null;
}

/** Manuscript material/typography settings (mirrors the design's `settings`). */
export interface ManuscriptSettings {
	paper: string;
	font: string;
	divider: string;
	dropcap: boolean;
	ornament: string;
	tint: string;
	handwritten: boolean;
}

export interface Book {
	id: string;
	title: string;
	titleRu?: string;
	author: string;
	subtitle?: string | null;
	year?: number | null;
	settings: ManuscriptSettings;
	cover: Cover;
	pageCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface Shelf {
	id: string;
	name: string;
	nameRu?: string;
	position: number;
	books: string[]; // ordered book ids
}

export interface Share {
	token: string;
	allowDownloads: boolean;
	revoked: boolean;
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
