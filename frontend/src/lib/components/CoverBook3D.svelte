<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	interface Props {
		artSrc?: string;
		coverText: string;
		spineText: string;
		coverColor: string;
		spineColor: string;
		coverTextColor: string;
		spineTextColor: string;
		foilColor: string;
		hideTitle?: boolean;
		pageCount?: number;
	}

	let {
		artSrc = '',
		coverText,
		spineText,
		coverColor,
		spineColor,
		coverTextColor,
		spineTextColor,
		foilColor,
		hideTitle = false,
		pageCount = 180
	}: Props = $props();

	let host: HTMLDivElement;
	let status = $state('');
	let ready = $state(false);

	let cleanup: (() => void) | null = null;
	let renderScene: ((opts: RenderOptions) => void) | null = null;

	type RenderOptions = Required<Props>;

	const opts = $derived({
		artSrc,
		coverText,
		spineText,
		coverColor,
		spineColor,
		coverTextColor,
		spineTextColor,
		foilColor,
		hideTitle,
		pageCount
	});

	$effect(() => {
		if (renderScene) renderScene(opts);
	});

	onMount(async () => {
		try {
			const THREE = await import('three');
			const scene = new THREE.Scene();
			scene.background = null;

			const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
			camera.position.set(0, 0.25, 7.2);

			const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.outputColorSpace = THREE.SRGBColorSpace;
			renderer.shadowMap.enabled = true;
			host.appendChild(renderer.domElement);

			const key = new THREE.DirectionalLight(0xfff2d0, 3.1);
			key.position.set(-3.8, 4.4, 5.6);
			key.castShadow = true;
			scene.add(key);
			scene.add(new THREE.AmbientLight(0xd9c19a, 1.2));

			const fill = new THREE.DirectionalLight(0x7f5836, 1.1);
			fill.position.set(4, -1, -2);
			scene.add(fill);

			const group = new THREE.Group();
			group.rotation.set(0.1, 0.45, 0.02);
			scene.add(group);

			const shadow = new THREE.Mesh(
				new THREE.PlaneGeometry(4.2, 4.8),
				new THREE.ShadowMaterial({ color: 0x1f140b, opacity: 0.22 })
			);
			shadow.position.set(0.28, -2.0, -0.34);
			shadow.rotation.x = -Math.PI / 2;
			shadow.receiveShadow = true;
			scene.add(shadow);

			let book: import('three').Mesh | null = null;
			let frontTexture: import('three').CanvasTexture | null = null;
			let spineTexture: import('three').CanvasTexture | null = null;
			let currentArt = '';
			let disposed = false;
			let dragging = false;
			let dragStart = { x: 0, y: 0, rx: 0, ry: 0 };

			function resize() {
				if (!host) return;
				const rect = host.getBoundingClientRect();
				const width = Math.max(260, rect.width);
				const height = Math.max(360, rect.height);
				renderer.setSize(width, height, false);
				camera.aspect = width / height;
				camera.updateProjectionMatrix();
			}

			function animate() {
				if (disposed) return;
				renderer.render(scene, camera);
				requestAnimationFrame(animate);
			}

			function disposeBook() {
				if (!book) return;
				group.remove(book);
				book.geometry.dispose();
				for (const material of book.material as import('three').Material[]) material.dispose();
				frontTexture?.dispose();
				spineTexture?.dispose();
				frontTexture = null;
				spineTexture = null;
				book = null;
			}

			async function draw(next: RenderOptions) {
				if (disposed) return;
				const depth = Math.max(0.64, Math.min(1.35, 0.58 + Math.sqrt(next.pageCount || 180) * 0.035));
				const frontCanvas = await makeFrontCanvas(next);
				const spineCanvas = makeSpineCanvas(next);
				const pageCanvas = makePageCanvas();

				disposeBook();
				frontTexture = new THREE.CanvasTexture(frontCanvas);
				spineTexture = new THREE.CanvasTexture(spineCanvas);
				const pageTexture = new THREE.CanvasTexture(pageCanvas);
				frontTexture.colorSpace = THREE.SRGBColorSpace;
				spineTexture.colorSpace = THREE.SRGBColorSpace;
				pageTexture.colorSpace = THREE.SRGBColorSpace;

				const rough = 0.78;
				const materials = [
					new THREE.MeshStandardMaterial({ map: pageTexture, roughness: 0.84 }),
					new THREE.MeshStandardMaterial({ map: spineTexture, roughness: rough }),
					new THREE.MeshStandardMaterial({ map: pageTexture, roughness: 0.9 }),
					new THREE.MeshStandardMaterial({ map: pageTexture, roughness: 0.9 }),
					new THREE.MeshStandardMaterial({ map: frontTexture, roughness: rough }),
					new THREE.MeshStandardMaterial({ color: next.spineColor, roughness: 0.86 })
				];

				book = new THREE.Mesh(new THREE.BoxGeometry(2.28, 3.42, depth, 1, 1, 10), materials);
				book.castShadow = true;
				book.receiveShadow = true;
				group.add(book);
				currentArt = next.artSrc;
			}

			renderScene = (next) => {
				void draw(next);
			};

			function onDown(e: PointerEvent) {
				dragging = true;
				(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
				dragStart = { x: e.clientX, y: e.clientY, rx: group.rotation.x, ry: group.rotation.y };
			}
			function onMove(e: PointerEvent) {
				if (!dragging) return;
				group.rotation.y = clamp(dragStart.ry + (e.clientX - dragStart.x) * 0.008, -0.55, 1.25);
				group.rotation.x = clamp(dragStart.rx + (e.clientY - dragStart.y) * 0.004, -0.3, 0.35);
			}
			function onUp() {
				dragging = false;
			}

			host.addEventListener('pointerdown', onDown);
			host.addEventListener('pointermove', onMove);
			host.addEventListener('pointerup', onUp);
			host.addEventListener('pointercancel', onUp);
			window.addEventListener('resize', resize);
			resize();
			await draw(opts);
			ready = true;
			animate();

			cleanup = () => {
				disposed = true;
				host.removeEventListener('pointerdown', onDown);
				host.removeEventListener('pointermove', onMove);
				host.removeEventListener('pointerup', onUp);
				host.removeEventListener('pointercancel', onUp);
				window.removeEventListener('resize', resize);
				disposeBook();
				renderer.dispose();
				renderer.domElement.remove();
			};
		} catch (e) {
			status = e instanceof Error ? e.message : 'Could not load 3D preview';
		}
	});

	onDestroy(() => cleanup?.());

	function clamp(n: number, min: number, max: number) {
		return Math.max(min, Math.min(max, n));
	}

	function makePageCanvas() {
		const c = document.createElement('canvas');
		c.width = 180;
		c.height = 720;
		const ctx = c.getContext('2d')!;
		ctx.fillStyle = '#ead5a4';
		ctx.fillRect(0, 0, c.width, c.height);
		for (let y = 0; y < c.height; y += 9) {
			ctx.fillStyle = y % 18 === 0 ? 'rgba(80,45,17,.23)' : 'rgba(80,45,17,.12)';
			ctx.fillRect(0, y, c.width, 1);
		}
		const g = ctx.createLinearGradient(0, 0, c.width, 0);
		g.addColorStop(0, 'rgba(80,45,17,.16)');
		g.addColorStop(0.55, 'rgba(255,248,214,.45)');
		g.addColorStop(1, 'rgba(80,45,17,.24)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, c.width, c.height);
		return c;
	}

	async function makeFrontCanvas(o: RenderOptions) {
		const c = document.createElement('canvas');
		c.width = 900;
		c.height = 1350;
		const ctx = c.getContext('2d')!;
		ctx.fillStyle = o.coverColor;
		ctx.fillRect(0, 0, c.width, c.height);

		if (o.artSrc) {
			const img = await loadImage(o.artSrc).catch(() => null);
			if (img) drawCoverImage(ctx, img, c.width, c.height);
		} else {
			drawProceduralCover(ctx, o);
		}

		const shade = ctx.createLinearGradient(0, 0, c.width, 0);
		shade.addColorStop(0, 'rgba(0,0,0,.28)');
		shade.addColorStop(0.09, 'rgba(255,255,255,.06)');
		shade.addColorStop(0.82, 'rgba(0,0,0,0)');
		shade.addColorStop(1, 'rgba(0,0,0,.22)');
		ctx.fillStyle = shade;
		ctx.fillRect(0, 0, c.width, c.height);

		if (!o.hideTitle && o.coverText.trim()) {
			drawMultilineText(ctx, o.coverText, {
				x: 106,
				y: 920,
				maxWidth: 690,
				color: o.coverTextColor,
				size: 62,
				lineHeight: 70,
				align: 'left'
			});
		}
		return c;
	}

	function makeSpineCanvas(o: RenderOptions) {
		const c = document.createElement('canvas');
		c.width = 320;
		c.height = 1350;
		const ctx = c.getContext('2d')!;
		const g = ctx.createLinearGradient(0, 0, c.width, 0);
		g.addColorStop(0, shadeColor(o.spineColor, -34));
		g.addColorStop(0.42, o.spineColor);
		g.addColorStop(0.64, shadeColor(o.spineColor, 18));
		g.addColorStop(1, shadeColor(o.spineColor, -26));
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, c.width, c.height);

		ctx.strokeStyle = 'rgba(255,255,255,.16)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.moveTo(48, 0);
		ctx.lineTo(48, c.height);
		ctx.moveTo(c.width - 48, 0);
		ctx.lineTo(c.width - 48, c.height);
		ctx.stroke();

		ctx.strokeStyle = o.foilColor;
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(82, 150);
		ctx.lineTo(c.width - 82, 150);
		ctx.moveTo(82, c.height - 150);
		ctx.lineTo(c.width - 82, c.height - 150);
		ctx.stroke();

		ctx.save();
		ctx.translate(c.width / 2, c.height / 2);
		ctx.rotate(-Math.PI / 2);
		drawMultilineText(ctx, o.spineText || o.coverText, {
			x: -520,
			y: 14,
			maxWidth: 1040,
			color: o.spineTextColor,
			size: 66,
			lineHeight: 74,
			align: 'center'
		});
		ctx.restore();
		return c;
	}

	function drawProceduralCover(ctx: CanvasRenderingContext2D, o: RenderOptions) {
		const w = ctx.canvas.width;
		const h = ctx.canvas.height;
		ctx.strokeStyle = o.foilColor;
		ctx.lineWidth = 5;
		ctx.strokeRect(w * 0.14, h * 0.12, w * 0.72, h * 0.48);
		ctx.strokeStyle = 'rgba(0,0,0,.18)';
		ctx.lineWidth = 9;
		ctx.strokeRect(w * 0.15, h * 0.13, w * 0.7, h * 0.46);
		ctx.save();
		ctx.translate(w / 2, h * 0.35);
		ctx.rotate(Math.PI / 4);
		ctx.strokeStyle = o.foilColor;
		ctx.lineWidth = 4;
		ctx.strokeRect(-34, -34, 68, 68);
		ctx.restore();
	}

	function drawCoverImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number) {
		const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
		const w = img.naturalWidth * scale;
		const h = img.naturalHeight * scale;
		ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
	}

	function drawMultilineText(
		ctx: CanvasRenderingContext2D,
		text: string,
		opts: { x: number; y: number; maxWidth: number; color: string; size: number; lineHeight: number; align: CanvasTextAlign }
	) {
		const lines = text.split(/\r?\n/);
		let size = opts.size;
		ctx.textAlign = opts.align;
		ctx.textBaseline = 'top';
		ctx.fillStyle = opts.color;
		ctx.shadowColor = 'rgba(0,0,0,.36)';
		ctx.shadowBlur = 5;
		ctx.shadowOffsetY = 2;
		do {
			ctx.font = `700 ${size}px Cinzel, Georgia, serif`;
			if (lines.every((line) => ctx.measureText(line || ' ').width <= opts.maxWidth)) break;
			size -= 2;
		} while (size > 22);
		const lineHeight = Math.max(size * 1.12, opts.lineHeight * (size / opts.size));
		const startX = opts.align === 'center' ? opts.x + opts.maxWidth / 2 : opts.x;
		lines.forEach((line, index) => {
			ctx.fillText(line || ' ', startX, opts.y + index * lineHeight, opts.maxWidth);
		});
		ctx.shadowColor = 'transparent';
	}

	function loadImage(src: string) {
		return new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	function shadeColor(hex: string, percent: number) {
		const clean = hex.replace('#', '');
		const n = parseInt(clean.length === 3 ? clean.split('').map((x) => x + x).join('') : clean, 16);
		const amount = Math.round(2.55 * percent);
		const r = clamp((n >> 16) + amount, 0, 255);
		const g = clamp(((n >> 8) & 0xff) + amount, 0, 255);
		const b = clamp((n & 0xff) + amount, 0, 255);
		return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
	}
</script>

<div class="book3d-canvas" bind:this={host} aria-label="3D book preview">
	{#if !ready && !status}
		<div class="preview-state">Loading 3D preview</div>
	{/if}
	{#if status}
		<div class="preview-state">{status}</div>
	{/if}
</div>

<style>
	.book3d-canvas {
		position: relative;
		width: min(100%, 620px);
		min-height: 460px;
		cursor: grab;
		touch-action: none;
		user-select: none;
	}
	.book3d-canvas:active {
		cursor: grabbing;
	}
	.book3d-canvas :global(canvas) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.preview-state {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--ink-faint);
		font-size: 14px;
	}
</style>
