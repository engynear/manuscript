import { writable, get } from 'svelte/store';
import { env } from '$env/dynamic/public';
import type { AuthResponse, ProgressEvent, User } from './types';

/** Base URL of the Go API. Falls back to same-origin (use a proxy in production). */
export function apiBase(): string {
	return (env.PUBLIC_API_BASE ?? '').replace(/\/$/, '');
}

const TOKEN_KEY = 'mf_token';

function initialToken(): string | null {
	if (typeof localStorage !== 'undefined') return localStorage.getItem(TOKEN_KEY);
	return null;
}

export const token = writable<string | null>(initialToken());
export const currentUser = writable<User | null>(null);

token.subscribe((value) => {
	if (typeof localStorage === 'undefined') return;
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
