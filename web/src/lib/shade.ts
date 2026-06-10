/** Shade a hex colour toward white (f > 1) or black (f < 1). Ported from primitives.jsx. */
export function shade(hex: string, f: number): string {
	const n = parseInt(hex.slice(1), 16);
	let r = (n >> 16) & 255;
	let g = (n >> 8) & 255;
	let b = n & 255;
	if (f >= 1) {
		const t = f - 1;
		r += (255 - r) * t;
		g += (255 - g) * t;
		b += (255 - b) * t;
	} else {
		r *= f;
		g *= f;
		b *= f;
	}
	const c = (v: number) =>
		Math.max(0, Math.min(255, Math.round(v)))
			.toString(16)
			.padStart(2, '0');
	return `#${c(r)}${c(g)}${c(b)}`;
}
