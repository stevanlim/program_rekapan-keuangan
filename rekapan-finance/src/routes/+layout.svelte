<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Sistem Rekapan OS Hutang & Pembayaran Keuangan</title>
	<meta name="description" content="Sistem Rekapitulasi OS Hutang, Aging, Notifikasi H-5, dan Rekapan Pembayaran Multi-PT" />
</svelte:head>

{@render children()}
