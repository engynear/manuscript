<script lang="ts">
	/* Tiny line-icon set, ported from the prototype's primitives.jsx. */
	interface Shape {
		kind: 'path' | 'circle' | 'rect';
		attrs: Record<string, string>;
	}
	interface Props {
		name: string;
		size?: number;
		stroke?: number;
		style?: string;
	}
	let { name, size = 18, stroke = 1.7, style = '' }: Props = $props();

	const p = (d: string): Shape => ({ kind: 'path', attrs: { d } });
	const c = (cx: string, cy: string, r: string): Shape => ({
		kind: 'circle',
		attrs: { cx, cy, r }
	});
	const r = (
		x: string,
		y: string,
		width: string,
		height: string,
		rx: string
	): Shape => ({ kind: 'rect', attrs: { x, y, width, height, rx } });

	const ICONS: Record<string, Shape[]> = {
		forge: [p('M4 20h16'), p('M7 20V11l5-4 5 4v9'), p('M10 20v-5h4v5')],
		library: [r('4', '4', '6.5', '16', '1'), r('13.5', '4', '6.5', '16', '1'), p('M7 8h0.5M16.7 8h0.5')],
		shelves: [p('M3 7h18M3 17h18'), p('M6 7v-.5M6 17V7M9 17V9M12 17V7M16 17v-6M19 17V8')],
		search: [c('11', '11', '7'), p('m20 20-3.2-3.2')],
		settings: [
			c('12', '12', '3.2'),
			p('M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1')
		],
		download: [p('M12 4v11M7 11l5 4 5-4'), p('M5 20h14')],
		read: [
			p('M12 6c-1.8-1.2-4-1.6-6.5-1.6V18c2.5 0 4.7.4 6.5 1.6 1.8-1.2 4-1.6 6.5-1.6V4.4C16 4.4 13.8 4.8 12 6Z'),
			p('M12 6v13.6')
		],
		plus: [p('M12 5v14M5 12h14')],
		close: [p('M6 6l12 12M18 6 6 18')],
		chevL: [p('M15 5l-7 7 7 7')],
		chevR: [p('M9 5l7 7-7 7')],
		chevD: [p('M5 9l7 7 7-7')],
		edit: [p('M4 20h4l10-10-4-4L4 16v4Z'), p('M13.5 6.5l4 4')],
		trash: [p('M5 7h14M9 7V5h6v2M6 7l1 13h10l1-13')],
		share: [c('6', '12', '2.4'), c('17', '6', '2.4'), c('17', '18', '2.4'), p('M8.2 11 14.8 7.2M8.2 13l6.6 3.8')],
		bookmark: [p('M7 4h10v16l-5-3.5L7 20V4Z')],
		contents: [p('M5 6h14M5 12h14M5 18h9')],
		link: [
			p('M9 14a4 4 0 0 0 6 0l2-2a4 4 0 0 0-6-6l-1 1'),
			p('M15 10a4 4 0 0 0-6 0l-2 2a4 4 0 0 0 6 6l1-1')
		],
		check: [p('M5 12.5 10 17l9-10')],
		globe: [c('12', '12', '8.5'), p('M3.5 12h17M12 3.5c2.4 2.3 2.4 14.7 0 17M12 3.5c-2.4 2.3-2.4 14.7 0 17')],
		user: [c('12', '8', '3.4'), p('M5.5 20a6.5 6.5 0 0 1 13 0')],
		sort: [p('M7 5v14M7 19l-3-3M7 5l3 3'), p('M17 19V5M17 5l3 3M17 19l-3-3')],
		grip: [
			c('9', '6', '1.3'),
			c('15', '6', '1.3'),
			c('9', '12', '1.3'),
			c('15', '12', '1.3'),
			c('9', '18', '1.3'),
			c('15', '18', '1.3')
		],
		sparkle: [p('M12 4l1.6 4.8L18.4 10l-4.8 1.6L12 16l-1.6-4.4L5.6 10l4.8-1.2L12 4Z')],
		upload: [p('M12 16V5M7 10l5-5 5 5'), p('M5 20h14')],
		image: [r('4', '5', '16', '14', '1.5'), c('9', '10', '1.6'), p('m5 17 4.5-4 3 2.5L16 12l3 3.2')]
	};

	const shapes = $derived(ICONS[name] ?? []);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	{style}
	aria-hidden="true"
>
	{#each shapes as shape}
		{#if shape.kind === 'path'}
			<path d={shape.attrs.d} />
		{:else if shape.kind === 'circle'}
			<circle cx={shape.attrs.cx} cy={shape.attrs.cy} r={shape.attrs.r} />
		{:else if shape.kind === 'rect'}
			<rect
				x={shape.attrs.x}
				y={shape.attrs.y}
				width={shape.attrs.width}
				height={shape.attrs.height}
				rx={shape.attrs.rx}
			/>
		{/if}
	{/each}
</svg>
