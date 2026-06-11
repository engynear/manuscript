<script lang="ts">
	let { size = 38 }: { size?: number } = $props();
</script>

<div
	style="width:{size}px;height:{size}px;border-radius:8px;flex:0 0 auto;
		background:linear-gradient(160deg,#2f2419,#1c1610);
		box-shadow:inset 0 0 0 1px rgba(201,164,86,.5),inset 0 0 14px rgba(0,0,0,.6),var(--shadow-sm);
		display:grid;place-items:center;color:var(--gilt-bright)"
>
	<span
		style="font-family:var(--font-display);font-weight:700;font-size:{size *
			0.52}px;text-shadow:0 1px 2px rgba(0,0,0,.6)">M</span
	>
</div>
