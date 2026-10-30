<script lang="ts">
	/**
	 * CatMascot.svelte
	 * Interactive Animated Sprout Cat Mascot (Kucing Tauge Lucu)
	 * Features:
	 * - Exact match with user's reference images:
	 *   - Circular pastel pink background
	 *   - Cute white chubby cat with pink inner ears and pink bow tie
	 *   - Green sprout (tauge) with glossy leaves that sways
	 *   - Rosy airbrushed cheeks with 3 cute white sparkle dots
	 *   - Continuous seamless arms covering eyes for password & PIN (no severed edges)
	 *   - Peek mode: one eye peeking, other paw stays covering
	 *   - Eye gaze tracking text input
	 *   - Blinking in idle mode
	 *   - Happy bounce on success and cute wobble on error
	 */
	let {
		mode = 'idle', // 'idle' | 'username' | 'password' | 'peek' | 'pin' | 'success' | 'error'
		charCount = 0,
		maxChars = 25
	}: {
		mode?: 'idle' | 'username' | 'password' | 'peek' | 'pin' | 'success' | 'error';
		charCount?: number;
		maxChars?: number;
	} = $props();

	// Kalkulasi pergeseran mata saat mengetik username
	let eyeShift = $derived.by(() => {
		if (mode === 'username') {
			const progress = Math.min(Math.max(charCount / maxChars, 0), 1);
			const x = (progress - 0.5) * 8; // -4px sampai +4px
			const y = 4; // melirik ke bawah ke arah input form
			return { x, y };
		}
		return { x: 0, y: 0 };
	});

	// Animasi kedipan mata berkala saat idle
	let isBlinking = $state(false);
	$effect(() => {
		const interval = setInterval(() => {
			if (mode === 'idle' || mode === 'username') {
				isBlinking = true;
				setTimeout(() => {
					isBlinking = false;
				}, 180);
			}
		}, 3800);
		return () => clearInterval(interval);
	});
</script>

<div class="cat-container" class:cat-success={mode === 'success'} class:cat-error={mode === 'error'}>
	<svg
		viewBox="0 0 200 200"
		class="cat-svg"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
	>
		<defs>
			<!-- Clip Path Lingkaran agar tangan terhubung mulus ke tepi lingkaran persis referensi Gambar 1 -->
			<clipPath id="circleClip">
				<circle cx="100" cy="100" r="88" />
			</clipPath>

			<!-- Radial Gradient Blush Pipi Merona Pink -->
			<radialGradient id="blushGlow" cx="50%" cy="50%" r="50%">
				<stop offset="0%" stop-color="#f43f5e" stop-opacity="0.65" />
				<stop offset="50%" stop-color="#fb7185" stop-opacity="0.35" />
				<stop offset="100%" stop-color="#f43f5e" stop-opacity="0" />
			</radialGradient>

			<!-- Gradient Background Lingkaran Pink Lembut Pastel -->
			<linearGradient id="circleBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color="#ffe4ec" />
				<stop offset="50%" stop-color="#ffd0df" />
				<stop offset="100%" stop-color="#fbcfe8" />
			</linearGradient>

			<!-- Shadow Halus Tangan -->
			<filter id="pawShadow" x="-20%" y="-20%" width="140%" height="140%">
				<feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#2e1520" flood-opacity="0.18" />
			</filter>
		</defs>

		<!-- ================= LINGKARAN FRAME PASTEL PINK ================= -->
		<circle
			cx="100"
			cy="100"
			r="88"
			fill="url(#circleBgGrad)"
			stroke="#381c27"
			stroke-width="2.5"
		/>

		<!-- SELURUH ELEMEN DI DALAM LINGKARAN DI-CLIP AGAR PERSIS SEPERTI GAMBAR USER -->
		<g clip-path="url(#circleClip)">

			<!-- ================= BADAN / DADA KUCING ================= -->
			<!-- Leher dan Dada Putih -->
			<path
				d="M 70 162 C 60 175 50 195 45 205 L 155 205 C 150 195 140 175 130 162 Z"
				fill="#ffffff"
				stroke="#381c27"
				stroke-width="2.5"
			/>

			<!-- ================= DAUN TAUGE (SPROUT) ================= -->
			<g class="sprout-group" class:sprout-excited={mode === 'username'} class:sprout-celebrate={mode === 'success'}>
				<!-- Batang Tauge Hijau Melengkung Lembut -->
				<path
					d="M 100 82 C 97 64 104 46 99 28"
					stroke="#22c55e"
					stroke-width="3.2"
					stroke-linecap="round"
					fill="none"
				/>

				<!-- Daun Kiri -->
				<path
					d="M 99 28 C 86 16 68 20 74 34 C 78 42 96 31 99 28 Z"
					fill="#4ade80"
					stroke="#16a34a"
					stroke-width="1.8"
				/>
				<ellipse cx="80" cy="27" rx="3.5" ry="1.8" transform="rotate(-35 80 27)" fill="#ffffff" opacity="0.85" />

				<!-- Daun Kanan -->
				<path
					d="M 99 28 C 112 16 130 20 124 34 C 120 42 102 31 99 28 Z"
					fill="#4ade80"
					stroke="#16a34a"
					stroke-width="1.8"
				/>
				<ellipse cx="118" cy="27" rx="3.5" ry="1.8" transform="rotate(35 118 27)" fill="#ffffff" opacity="0.85" />
			</g>

			<!-- ================= TELINGA KUCING ================= -->
			<path
				d="M 62 88 C 55 64 52 46 54 44 C 57 42 75 58 84 72 Z"
				fill="#ffffff"
				stroke="#381c27"
				stroke-width="2.5"
				stroke-linejoin="round"
			/>
			<path
				d="M 63 80 C 58 65 57 52 58 50 C 60 50 72 62 77 72 Z"
				fill="#fca5a5"
				opacity="0.9"
			/>

			<path
				d="M 138 88 C 145 64 148 46 146 44 C 143 42 125 58 116 72 Z"
				fill="#ffffff"
				stroke="#381c27"
				stroke-width="2.5"
				stroke-linejoin="round"
			/>
			<path
				d="M 137 80 C 142 65 143 52 142 50 C 140 50 128 62 123 72 Z"
				fill="#fca5a5"
				opacity="0.9"
			/>

			<!-- ================= KEPALA KUCING ================= -->
			<path
				d="M 82 72 
				   C 88 74 112 74 118 72 
				   C 125 74 135 84 138 90 
				   C 146 100 156 112 153 128 
				   C 150 144 135 158 122 162 
				   C 112 165 88 165 78 162 
				   C 65 158 50 144 47 128 
				   C 44 112 54 100 62 90 
				   C 65 84 75 74 82 72 Z"
				fill="#ffffff"
				stroke="#381c27"
				stroke-width="2.5"
				stroke-linejoin="round"
			/>

			<!-- ================= PIPI MERONA (ROSY BLUSH) + SPARKLE DOTS ================= -->
			<ellipse cx="68" cy="127" rx="14" ry="9" fill="url(#blushGlow)" />
			<circle cx="63" cy="124" r="1.4" fill="#ffffff" opacity="0.9" />
			<circle cx="68" cy="128" r="1.8" fill="#ffffff" opacity="0.95" />
			<circle cx="73" cy="125" r="1.3" fill="#ffffff" opacity="0.9" />

			<ellipse cx="132" cy="127" rx="14" ry="9" fill="url(#blushGlow)" />
			<circle cx="127" cy="125" r="1.3" fill="#ffffff" opacity="0.9" />
			<circle cx="132" cy="128" r="1.8" fill="#ffffff" opacity="0.95" />
			<circle cx="137" cy="124" r="1.4" fill="#ffffff" opacity="0.9" />

			<!-- ================= KUMIS KUCING (WHISKERS) ================= -->
			<path d="M 58 122 C 44 120 30 122 24 125" stroke="#381c27" stroke-width="2" stroke-linecap="round" fill="none" />
			<path d="M 58 130 C 44 133 30 140 25 145" stroke="#381c27" stroke-width="2" stroke-linecap="round" fill="none" />
			<path d="M 142 122 C 156 120 170 122 176 125" stroke="#381c27" stroke-width="2" stroke-linecap="round" fill="none" />
			<path d="M 142 130 C 156 133 170 140 175 145" stroke="#381c27" stroke-width="2" stroke-linecap="round" fill="none" />

			<!-- ================= MATA KUCING ================= -->
			{#if mode === 'success'}
				<!-- Mata Tersenyum Bahagia Lengkungan Lucu (^  ^) -->
				<path
					d="M 70 114 Q 78 104 86 114"
					stroke="#381c27"
					stroke-width="3"
					stroke-linecap="round"
					fill="none"
				/>
				<path
					d="M 114 114 Q 122 104 130 114"
					stroke="#381c27"
					stroke-width="3"
					stroke-linecap="round"
					fill="none"
				/>
			{:else}
				<!-- Mata Kiri -->
				<g class="cat-eye-group" style="transform: translate({eyeShift.x}px, {eyeShift.y}px);">
					<ellipse
						cx="78"
						cy="112"
						rx="9"
						ry={isBlinking ? '1.5' : '11'}
						fill="#27121b"
						class="cat-pupil"
					/>
					{#if !isBlinking}
						<circle cx="75.5" cy="108" r="3.2" fill="#ffffff" />
						<circle cx="81.5" cy="116" r="1.4" fill="#ffffff" opacity="0.85" />
					{/if}
				</g>

				<!-- Mata Kanan -->
				<g class="cat-eye-group" style="transform: translate({eyeShift.x}px, {eyeShift.y}px);">
					<ellipse
						cx="122"
						cy="112"
						rx="9"
						ry={isBlinking ? '1.5' : '11'}
						fill="#27121b"
						class="cat-pupil"
					/>
					{#if !isBlinking}
						<circle cx="119.5" cy="108" r="3.2" fill="#ffffff" />
						<circle cx="125.5" cy="116" r="1.4" fill="#ffffff" opacity="0.85" />
					{/if}
				</g>
			{/if}

			<!-- ================= HIDUNG KUCING ================= -->
			<path
				d="M 97 122 C 98 120 102 120 103 122 C 104 124 100 126 100 126 C 100 126 96 124 97 122 Z"
				fill="#381c27"
			/>

			<!-- ================= MULUT KUCING ================= -->
			{#if mode === 'success'}
				<!-- Senyum Lebar Banget dengan Lidah Pink Lucu -->
				<path
					d="M 92 129 Q 100 144 108 129 Z"
					fill="#e11d48"
					stroke="#381c27"
					stroke-width="2"
				/>
				<ellipse cx="100" cy="136" rx="5" ry="3" fill="#fda4af" />
			{:else if mode === 'username' || mode === 'password' || mode === 'pin' || mode === 'peek'}
				<!-- Mulut Terbuka Imut :3 dengan Lidah Pink (Persis Gambar 1 & Gambar 3) -->
				<path
					d="M 93 128 Q 100 140 107 128 Z"
					fill="#e11d48"
					stroke="#381c27"
					stroke-width="1.8"
				/>
				<ellipse cx="100" cy="134" rx="4.5" ry="2.8" fill="#fca5a5" />
			{:else if mode === 'error'}
				<!-- Mulut Kaget / Khawatir Gelombang -->
				<path
					d="M 94 134 Q 97 130 100 134 Q 103 138 106 134"
					stroke="#381c27"
					stroke-width="2"
					stroke-linecap="round"
					fill="none"
				/>
			{:else}
				<!-- Mulut Senyum Kucing Imut :3 (Persis Gambar 2) -->
				<path
					d="M 93 129 Q 96.5 133 100 129 Q 103.5 133 107 129"
					stroke="#381c27"
					stroke-width="2"
					stroke-linecap="round"
					fill="none"
				/>
			{/if}

			<!-- ================= DASI KUPU-KUPU PINK DI LEHER ================= -->
			<g id="bow-tie">
				<path
					d="M 100 157 C 93 150 83 151 83 158 C 83 165 93 166 100 159 Z"
					fill="#fb7185"
					stroke="#381c27"
					stroke-width="1.8"
					stroke-linejoin="round"
				/>
				<path d="M 89 155 Q 92 158 89 161" stroke="#e11d48" stroke-width="1" fill="none" />

				<path
					d="M 100 157 C 107 150 117 151 117 158 C 117 165 107 166 100 159 Z"
					fill="#fb7185"
					stroke="#381c27"
					stroke-width="1.8"
					stroke-linejoin="round"
				/>
				<path d="M 111 155 Q 108 158 111 161" stroke="#e11d48" stroke-width="1" fill="none" />

				<circle
					cx="100"
					cy="158"
					r="3.5"
					fill="#f43f5e"
					stroke="#381c27"
					stroke-width="1.6"
				/>
			</g>

			<!-- ================= TANGAN / CAKAR KUCING (CONTINUOUS SEAMLESS ANCHORED) ================= -->
			<!-- Persis Gambar 1: Tangan terhubung mulus ke tepi lingkaran tanpa potongan/terputus! -->

			<!-- Lengan dan Cakar Kiri Menutup Mata -->
			<g
				class="cat-paw-arm left-arm"
				style="transform-origin: 10px 190px;
				       transform: {mode === 'password' || mode === 'pin' || mode === 'peek'
					? 'translate(0px, 0px) rotate(0deg)'
					: 'translate(-30px, 90px) rotate(-15deg)'};"
				filter="url(#pawShadow)"
			>
				<path
					d="M -10 160 
					   L 68 100 
					   C 71 96 76 96 79 99 
					   C 83 95 89 96 92 100 
					   C 96 97 101 100 101 105 
					   C 101 112 95 116 88 120 
					   L 20 185 
					   L 5 210 
					   L -20 190 Z"
					fill="#ffffff"
					stroke="#381c27"
					stroke-width="2.5"
					stroke-linejoin="round"
				/>
				<path d="M 79 100 C 80 105 78 110 74 113" stroke="#381c27" stroke-width="1.6" stroke-linecap="round" fill="none" />
				<path d="M 91 102 C 91 108 88 113 83 117" stroke="#381c27" stroke-width="1.6" stroke-linecap="round" fill="none" />
			</g>

			<!-- Lengan dan Cakar Kanan Menutup Mata / Mengintip -->
			<g
				class="cat-paw-arm right-arm"
				style="transform-origin: 190px 190px;
				       transform: {mode === 'password' || mode === 'pin'
					? 'translate(0px, 0px) rotate(0deg)'
					: mode === 'peek'
						? 'translate(32px, 48px) rotate(20deg)' /* Mengintip! Mata kanan terlihat jelas */
						: 'translate(30px, 90px) rotate(15deg)'};"
				filter="url(#pawShadow)"
			>
				<path
					d="M 210 160 
					   L 132 100 
					   C 129 96 124 96 121 99 
					   C 117 95 111 96 108 100 
					   C 104 97 99 100 99 105 
					   C 99 112 105 116 112 120 
					   L 180 185 
					   L 195 210 
					   L 220 190 Z"
					fill="#ffffff"
					stroke="#381c27"
					stroke-width="2.5"
					stroke-linejoin="round"
				/>
				<path d="M 121 100 C 120 105 122 110 126 113" stroke="#381c27" stroke-width="1.6" stroke-linecap="round" fill="none" />
				<path d="M 109 102 C 109 108 112 113 117 117" stroke="#381c27" stroke-width="1.6" stroke-linecap="round" fill="none" />
			</g>

		</g> <!-- End clip-path -->
	</svg>
</div>

<style>
	.cat-container {
		position: relative;
		width: 210px;
		height: 210px;
		margin: 0 auto;
		user-select: none;
		pointer-events: none;
		transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	/* Animasi Sukses Menyenangkan (Loncat Kegirangan) */
	.cat-success {
		animation: catBounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes catBounce {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-20px) scale(1.08); }
	}

	/* Animasi Error (Menggeleng Lucu) */
	.cat-error {
		animation: catWobble 0.5s ease;
	}

	@keyframes catWobble {
		0%, 100% { transform: rotate(0deg); }
		20% { transform: rotate(-8deg); }
		40% { transform: rotate(8deg); }
		60% { transform: rotate(-5deg); }
		80% { transform: rotate(5deg); }
	}

	.cat-svg {
		width: 100%;
		height: 100%;
		overflow: visible;
		filter: drop-shadow(0 12px 20px rgba(244, 63, 94, 0.15));
	}

	/* Pergerakan Tangan Halus Meluncur */
	.cat-paw-arm {
		transition: transform 0.42s cubic-bezier(0.34, 1.45, 0.64, 1);
	}

	/* Pupil Bergerak Mengikuti Ketikan */
	.cat-eye-group {
		transition: transform 0.12s ease-out;
	}

	.cat-pupil {
		transition: ry 0.1s ease-in-out;
	}

	/* Ayunan Tauge Lucu */
	.sprout-group {
		transform-origin: 99px 28px;
		animation: sproutSway 3s ease-in-out infinite;
	}

	@keyframes sproutSway {
		0%, 100% { transform: rotate(0deg); }
		50% { transform: rotate(6deg); }
	}

	.sprout-excited {
		animation: sproutSwayFast 0.8s ease-in-out infinite;
	}

	@keyframes sproutSwayFast {
		0%, 100% { transform: rotate(-4deg); }
		50% { transform: rotate(8deg); }
	}

	.sprout-celebrate {
		animation: sproutCelebrate 0.5s ease-in-out infinite alternate;
	}

	@keyframes sproutCelebrate {
		0% { transform: scale(1) rotate(-6deg); }
		100% { transform: scale(1.18) rotate(6deg); }
	}
</style>
