import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import type {
	AuthResponse,
	Book,
	BookImage,
	ManuscriptPlan,
	ProgressEvent,
	PublicShelf,
	Shelf,
	Share,
	User
} from './types';

/** Base URL of the Go API. Falls back to same-origin (use a proxy in production). */
export function apiBase(): string {
	return (env.PUBLIC_API_BASE ?? '').replace(/\/$/, '');
}

const TOKEN_KEY = 'mf_token';

function initialToken(): string | null {
	if (browser) return localStorage.getItem(TOKEN_KEY);
	return null;
}

export const token = writable<string | null>(initialToken());
export const currentUser = writable<User | null>(null);

token.subscribe((value) => {
	if (!browser) return;
	if (value) localStorage.setItem(TOKEN_KEY, value);
	else localStorage.removeItem(TOKEN_KEY);
});

export class ApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

/** Typed JSON request helper that attaches the JWT and unwraps errors. */
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const headers = new Headers(options.headers);
	if (!headers.has('Content-Type') && options.body) {
		headers.set('Content-Type', 'application/json');
	}
	const tok = get(token);
	if (tok) headers.set('Authorization', `Bearer ${tok}`);

	const res = await fetch(`${apiBase()}${path}`, {
		...options,
		headers,
		credentials: 'include'
	});

	if (!res.ok) {
		let message = res.statusText;
		try {
			const body = await res.json();
			if (body?.error) message = body.error;
		} catch {
			/* non-JSON error body */
		}
		throw new ApiError(res.status, message);
	}

	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

/** Reads an NDJSON stream line-by-line, invoking onEvent for each parsed event. */
export async function streamNDJSON(
	path: string,
	body: unknown,
	onEvent: (event: ProgressEvent) => void
): Promise<void> {
	const headers = new Headers({ 'Content-Type': 'application/json' });
	const tok = get(token);
	if (tok) headers.set('Authorization', `Bearer ${tok}`);

	const res = await fetch(`${apiBase()}${path}`, {
		method: 'POST',
		headers,
		credentials: 'include',
		body: JSON.stringify(body)
	});
	if (!res.ok || !res.body) {
		throw new ApiError(res.status, `request failed: ${res.status}`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let nl: number;
		while ((nl = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (line) onEvent(JSON.parse(line) as ProgressEvent);
		}
	}
	if (buffer.trim()) onEvent(JSON.parse(buffer.trim()) as ProgressEvent);
}

/* ---------------- auth ---------------- */

export const auth = {
	async register(email: string, password: string, displayName = ''): Promise<User> {
		const res = await request<AuthResponse>('/api/auth/register', {
			method: 'POST',
			body: JSON.stringify({ email, password, displayName })
		});
		token.set(res.token);
		currentUser.set(res.user);
		return res.user;
	},

	async login(email: string, password: string): Promise<User> {
		const res = await request<AuthResponse>('/api/auth/login', {
			method: 'POST',
			body: JSON.stringify({ email, password })
		});
		token.set(res.token);
		currentUser.set(res.user);
		return res.user;
	},

	async me(): Promise<User | null> {
		if (!get(token)) return null;
		try {
			const user = await request<User>('/api/auth/me');
			currentUser.set(user);
			return user;
		} catch {
			token.set(null);
			currentUser.set(null);
			return null;
		}
	},

	logout(): void {
		token.set(null);
		currentUser.set(null);
	}
};

/* ---------------- library / shelves / shares ---------------- */

export const books = {
	list: () => request<Book[]>('/api/books'),
	get: (id: string) => request<Book>(`/api/books/${id}`),
	create: (
		body: Partial<Book> & {
			sourceMarkdown?: string;
			plan?: ManuscriptPlan | null;
			contentHash?: string;
			images?: BookImage[];
		}
	) => request<Book>('/api/books', { method: 'POST', body: JSON.stringify(body) }),
	update: (id: string, body: Partial<Book>) =>
		request<Book>(`/api/books/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
	remove: (id: string) => request<void>(`/api/books/${id}`, { method: 'DELETE' })
};

/* ---------------- AI generation (Go OpenAI proxy) ---------------- */

export const generate = {
	/** Stream the AI manuscript plan. Resolves the `done` result payload. */
	plan: (
		body: { markdown: string; imageLimit: number },
		onEvent: (event: ProgressEvent) => void
	) => streamNDJSON('/api/plan', body, onEvent),
	/** Stream illustration generation. Resolves the `done` result payload. */
	images: (
		body: { hash: string; plan: ManuscriptPlan; imageLimit: number },
		onEvent: (event: ProgressEvent) => void
	) => streamNDJSON('/api/images', body, onEvent)
};

/** Upload an image (e.g. cover art) and return its relative media URL (e.g. "/media/uploads/..."). */
export async function uploadImage(file: File): Promise<string> {
	const form = new FormData();
	form.append('file', file);
	const headers = new Headers();
	const tok = get(token);
	if (tok) headers.set('Authorization', `Bearer ${tok}`);
	const res = await fetch(`${apiBase()}/api/upload`, {
		method: 'POST',
		headers,
		credentials: 'include',
		body: form
	});
	if (!res.ok) throw new ApiError(res.status, 'upload failed');
	const { url } = (await res.json()) as { url: string };
	return url;
}

/** Resolve a possibly-relative media URL (e.g. "/media/..") against the API base. */
export function mediaUrl(url: string | undefined | null): string {
	if (!url) return '';
	if (/^https?:\/\//.test(url)) return url;
	return `${apiBase()}${url}`;
}

export const shelves = {
	list: () => request<Shelf[]>('/api/shelves'),
	create: (name: string, nameRu = '') =>
		request<Shelf>('/api/shelves', { method: 'POST', body: JSON.stringify({ name, nameRu }) }),
	rename: (id: string, name: string, nameRu = '') =>
		request<Shelf>(`/api/shelves/${id}`, { method: 'PATCH', body: JSON.stringify({ name, nameRu }) }),
	remove: (id: string) => request<void>(`/api/shelves/${id}`, { method: 'DELETE' }),
	setBooks: (id: string, bookIds: string[]) =>
		request<Shelf>(`/api/shelves/${id}/books`, { method: 'PUT', body: JSON.stringify({ books: bookIds }) })
};

export const shares = {
	get: (shelfId: string) => request<Share>(`/api/shelves/${shelfId}/share`),
	create: (shelfId: string) => request<Share>(`/api/shelves/${shelfId}/share`, { method: 'POST' }),
	update: (shelfId: string, allowDownloads: boolean, revoked: boolean) =>
		request<Share>(`/api/shelves/${shelfId}/share`, {
			method: 'PATCH',
			body: JSON.stringify({ allowDownloads, revoked })
		}),
	regenerate: (shelfId: string) =>
		request<Share>(`/api/shelves/${shelfId}/share/regenerate`, { method: 'POST' }),
	/** Public, unauthenticated read of a shared shelf. */
	public: (token: string) => request<PublicShelf>(`/api/s/${token}`)
};
