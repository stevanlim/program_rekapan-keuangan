<script lang="ts">
	/**
	 * CatLogoIcon.svelte
	 * Cute Cat Mascot Face Icon (Matching the Login Mascot 1:1)
	 */
	let { size = 42 }: { size?: number } = $props();
</script>

<div class="cat-logo-icon" style="width: {size}px; height: {size}px;" title="OS Hutang - Sistem Rekapan Keuangan">
	<svg
		viewBox="0 0 200 200"
		width="{size}"
		height="{size}"
		fill="none"
		xmlns="http://www.w3.org/2000/svg"
		class="cat-logo-svg"
	>
		<defs>
			<!-- Clip Path Lingkaran Persis Seperti Mascot Login -->
			<clipPath id="catLogoCircleClip">
				<circle cx="100" cy="100" r="88" />
			</clipPath>

			<!-- Gradient Background Lingkaran Pink Pastel Menawan -->
			<linearGradient id="catLogoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color="#ffe4ec" />
				<stop offset="50%" stop-color="#ffd0df" />
				<stop offset="100%" stop-color="#fbcfe8" />
			</linearGradient>

			<!-- Radial Gradient Blush Pipi Merona Pink -->
			<radialGradient id="catLogoBlush" cx="50%" cy="50%" r="50%">
				<stop offset="0%" stop-color="#f43f5e" stop-opacity="0.75" />
				<stop offset="55%" stop-color="#fb7185" stop-opacity="0.35" />
				<stop offset="100%" stop-color="#f43f5e" stop-opacity="0" />
			</radialGradient>
		</defs>

		<!-- ================= LINGKARAN FRAME PASTEL PINK ================= -->
		<circle
			cx="100"
			cy="100"
			r="88"
			fill="url(#catLogoBgGrad)"
			stroke="#381c27"
			stroke-width="3"
		/>

		<!-- SELURUH ELEMEN DI DALAM LINGKARAN DI-CLIP AGAR PERSIS SEPERTI MASCOT LOGIN -->
		<g clip-path="url(#catLogoCircleClip)">
			<!-- ================= BADAN / LEHER PUTIH ================= -->
			<path
				d="M 68 160 C 58 175 48 195 44 205 L 156 205 C 152 195 142 175 132 160 Z"
				fill="#ffffff"
				stroke="#381c27"
				stroke-width="3"
			/>

			<!-- ================= DAUN TAUGE (SPROUT) ================= -->
			<g class="sprout-sway">
				<!-- Batang Tauge Hijau -->
				<path
					d="M 100 82 C 97 64 104 46 99 28"
					stroke="#22c55e"
					stroke-width="3.6"
					stroke-linecap="round"
					fill="none"
				/>

				<!-- Daun Kiri -->
				<path
					d="M 99 28 C 86 16 68 20 74 34 C 78 42 96 31 99 28 Z"
					fill="#4ade80"
					stroke="#16a34a"
					stroke-width="2"
				/>
				<ellipse cx="80" cy="27" rx="3.5" ry="1.8" transform="rotate(-35 80 27)" fill="#ffffff" opacity="0.85" />

				<!-- Daun Kanan -->
				<path
					d="M 99 28 C 112 16 130 20 124 34 C 120 42 102 31 99 28 Z"
					fill="#4ade80"
					stroke="#16a34a"
					stroke-width="2"
				/>
				<ellipse cx="118" cy="27" rx="3.5" ry="1.8" transform="rotate(35 118 27)" fill="#ffffff" opacity="0.85" />
			</g>

			<!-- ================= TELINGA KUCING ================= -->
			<!-- Telinga Kiri -->
			<path
				d="M 62 88 C 55 64 52 46 54 44 C 57 42 75 58 84 72 Z"
				fill="#ffffff"
				stroke="#381c27"
				stroke-width="3"
				stroke-linejoin="round"
			/>
			<path
				d="M 63 80 C 58 65 57 52 58 50 C 60 50 72 62 77 72 Z"
				fill="#fca5a5"
				opacity="0.95"
			/>

			<!-- Telinga Kanan -->
			<path
				d="M 138 88 C 145 64 148 46 146 44 C 143 42 125 58 116 72 Z"
				fill="#ffffff"
				stroke="#381c27"
				stroke-width="3"
				stroke-linejoin="round"
			/>
			<path
				d="M 137 80 C 142 65 143 52 142 50 C 140 50 128 62 123 72 Z"
				fill="#fca5a5"
				opacity="0.95"
			/>

			<!-- ================= KEPALA KUCING CHUBBY PUTIH ================= -->
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
				stroke-width="3"
				stroke-linejoin="round"
			/>

			<!-- ================= PIPI MERONA (ROSY BLUSH) + SPARKLES ================= -->
			<ellipse cx="68" cy="127" rx="15" ry="10" fill="url(#catLogoBlush)" />
			<circle cx="63" cy="124" r="1.6" fill="#ffffff" opacity="0.95" />
			<circle cx="68" cy="128" r="2.1" fill="#ffffff" opacity="0.95" />
			<circle cx="73" cy="125" r="1.5" fill="#ffffff" opacity="0.95" />

			<ellipse cx="132" cy="127" rx="15" ry="10" fill="url(#catLogoBlush)" />
			<circle cx="127" cy="125" r="1.5" fill="#ffffff" opacity="0.95" />
			<circle cx="132" cy="128" r="2.1" fill="#ffffff" opacity="0.95" />
			<circle cx="137" cy="124" r="1.6" fill="#ffffff" opacity="0.95" />

			<!-- ================= KUMIS KUCING ================= -->
			<path d="M 56 122 C 43 120 29 122 23 125" stroke="#381c27" stroke-width="2.3" stroke-linecap="round" fill="none" />
			<path d="M 56 130 C 43 133 29 140 24 145" stroke="#381c27" stroke-width="2.3" stroke-linecap="round" fill="none" />
			<path d="M 144 122 C 157 120 171 122 177 125" stroke="#381c27" stroke-width="2.3" stroke-linecap="round" fill="none" />
			<path d="M 144 130 C 157 133 171 140 176 145" stroke="#381c27" stroke-width="2.3" stroke-linecap="round" fill="none" />

			<!-- ================= MATA KUCING BESAR BERBINAR ================= -->
			<!-- Mata Kiri -->
			<ellipse cx="78" cy="112" rx="9.5" ry="11.5" fill="#27121b" />
			<circle cx="75" cy="108" r="3.6" fill="#ffffff" />
			<circle cx="81.5" cy="116" r="1.6" fill="#ffffff" opacity="0.9" />

			<!-- Mata Kanan -->
			<ellipse cx="122" cy="112" rx="9.5" ry="11.5" fill="#27121b" />
			<circle cx="119" cy="108" r="3.6" fill="#ffffff" />
			<circle cx="125.5" cy="116" r="1.6" fill="#ffffff" opacity="0.9" />

			<!-- ================= HIDUNG KUCING ================= -->
			<path
				d="M 97 122 C 98 120 102 120 103 122 C 104 124 100 126 100 126 C 100 126 96 124 97 122 Z"
				fill="#381c27"
			/>

			<!-- ================= MULUT SENYUM IMUT :3 ================= -->
			<path
				d="M 92 129 Q 96 133.5 100 129 Q 104 133.5 108 129"
				stroke="#381c27"
				stroke-width="2.4"
				stroke-linecap="round"
				fill="none"
			/>

			<!-- ================= DASI KUPU-KUPU PINK DI LEHER ================= -->
			<g id="logo-bow">
				<path
					d="M 100 157 C 93 150 83 151 83 158 C 83 165 93 166 100 159 Z"
					fill="#fb7185"
					stroke="#381c27"
					stroke-width="2"
					stroke-linejoin="round"
				/>
				<path
					d="M 100 157 C 107 150 117 151 117 158 C 117 165 107 166 100 159 Z"
					fill="#fb7185"
					stroke="#381c27"
					stroke-width="2"
					stroke-linejoin="round"
				/>
				<circle
					cx="100"
					cy="158"
					r="3.8"
					fill="#f43f5e"
					stroke="#381c27"
					stroke-width="1.8"
				/>
			</g>
		</g>
	</svg>
</div>

<style>
	.cat-logo-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: 50%;
		filter: drop-shadow(0 3px 10px rgba(244, 63, 94, 0.45));
		transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.25s ease;
		cursor: pointer;
	}

	.cat-logo-icon:hover {
		transform: scale(1.12) rotate(-4deg);
		filter: drop-shadow(0 4px 14px rgba(244, 63, 94, 0.65));
	}

	.cat-logo-svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	.sprout-sway {
		transform-origin: 100px 82px;
		animation: sproutWiggle 3.6s ease-in-out infinite;
	}

	@keyframes sproutWiggle {
		0%, 100% { transform: rotate(0deg); }
		25% { transform: rotate(-6deg); }
		75% { transform: rotate(6deg); }
	}
</style>