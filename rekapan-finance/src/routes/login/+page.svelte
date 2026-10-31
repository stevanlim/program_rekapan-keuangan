<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import CatMascot from "$lib/components/CatMascot.svelte";
	import { theme, toggleTheme, initTheme } from "$lib/theme";
	import { sound } from "$lib/sound";

	let { data } = $props<{
		rolesStatus?: {
			adminAvailable: boolean;
			bossAvailable: boolean;
			allFull: boolean;
			adminCount?: number;
			bossCount?: number;
			maxAdmin?: number;
			maxBoss?: number;
		};
	}>();

	// Status ketersediaan akun Admin & Boss (Maksimal 1 Admin & 2 Boss)
	let customRolesStatus = $state<{
		adminAvailable: boolean;
		bossAvailable: boolean;
		allFull: boolean;
		adminCount?: number;
		bossCount?: number;
		maxAdmin?: number;
		maxBoss?: number;
	} | null>(null);

	let rolesStatus = $derived(
		customRolesStatus || data?.rolesStatus || { adminAvailable: true, bossAvailable: true, allFull: false, adminCount: 0, bossCount: 0, maxAdmin: 1, maxBoss: 2 }
	);

	// Mode: Login atau Register
	let authMode = $state<"login" | "register">("login");

	// Step state (Login): 1 = Username & Password, 2 = PIN 6-Digit
	let step = $state<1 | 2>(1);

	// Step 1 Form (Login)
	let username = $state("");
	let password = $state("");
	let showPassword = $state(false);

	// Register Form
	let regRole = $state<"admin" | "boss">("admin");
	let regName = $state("");
	let regUsername = $state("");
	let regPassword = $state("");
	let showRegPassword = $state(false);
	let regPin = $state("");
	let showRegPin = $state(false);

	// Step 2 Form (PIN 6-digit Login)
	let pinDigits = $state<string[]>(["", "", "", "", "", ""]);
	let tempToken = $state("");
	let pinInputs: HTMLInputElement[] = [];

	// UI & Animation state
	let isLoading = $state(false);
	let errorMessage = $state("");
	let successMessage = $state("");
	let isShaking = $state(false);
	let mascotMode = $state<
		"idle" | "username" | "password" | "peek" | "pin" | "success" | "error"
	>("idle");

	// Otomatis arahkan pilihan role ke peran yang masih kosong
	$effect(() => {
		if (!rolesStatus.adminAvailable && rolesStatus.bossAvailable && regRole === "admin") {
			regRole = "boss";
		} else if (!rolesStatus.bossAvailable && rolesStatus.adminAvailable && regRole === "boss") {
			regRole = "admin";
		}
	});

	onMount(() => {
		initTheme();
		refreshRolesStatus();
	});

	async function refreshRolesStatus() {
		try {
			const res = await fetch("/api/auth/register");
			if (res.ok) {
				const fresh = await res.json();
				customRolesStatus = fresh;
				if (!fresh.adminAvailable && fresh.bossAvailable && regRole === "admin") {
					regRole = "boss";
				} else if (!fresh.bossAvailable && fresh.adminAvailable && regRole === "boss") {
					regRole = "admin";
				}
			}
		} catch (err) {
			// ignore network error
		}
	}

	function handleUsernameFocus() {
		if (mascotMode !== "success") mascotMode = "username";
	}

	function handleUsernameBlur() {
		if (mascotMode === "username") mascotMode = "idle";
	}

	function handlePasswordFocus() {
		if (mascotMode !== "success") {
			mascotMode = showPassword ? "peek" : "password";
		}
	}

	function handlePasswordBlur() {
		if (mascotMode === "password" || mascotMode === "peek") {
			mascotMode = "idle";
		}
	}

	function toggleShowPassword() {
		showPassword = !showPassword;
		mascotMode = showPassword ? "peek" : "password";
	}

	function handleRegFocus(field: "name" | "username" | "password" | "pin") {
		if (mascotMode === "success") return;
		if (field === "name" || field === "username") mascotMode = "username";
		else if (field === "password") mascotMode = showRegPassword ? "peek" : "password";
		else if (field === "pin") mascotMode = "pin";
	}

	function handleRegBlur() {
		if (mascotMode !== "success") mascotMode = "idle";
	}

	function triggerShake(msg: string) {
		errorMessage = msg;
		isShaking = true;
		mascotMode = "error";
		sound.playMerah();

		setTimeout(() => {
			isShaking = false;
			if (authMode === "login" && step === 2) mascotMode = "pin";
			else mascotMode = "idle";
		}, 650);
	}

	// Step 1 Submit (Login: Username & Password)
	async function handleStep1Submit(e: Event) {
		e.preventDefault();
		if (isLoading) return;

		errorMessage = "";
		successMessage = "";
		isLoading = true;

		try {
			const res = await fetch("/api/auth/login-step1", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});

			const data = await res.json();

			if (!res.ok) {
				triggerShake(data.error || "Username atau Password salah");
				return;
			}

			// Sukses Tahap 1 -> Bunyi aman, ganti mascot ke pin mode
			sound.playAman();
			tempToken = data.temp_token;
			step = 2;
			mascotMode = "pin";
			pinDigits = ["", "", "", "", "", ""];

			setTimeout(() => {
				if (pinInputs[0]) pinInputs[0].focus();
			}, 150);
		} catch (err) {
			triggerShake("Gagal menghubungi server. Periksa koneksi Anda.");
		} finally {
			isLoading = false;
		}
	}

	// Submit Register (Admin & Boss) dengan proteksi maksimal 1 akun per role
	async function handleRegisterSubmit(e: Event) {
		e.preventDefault();
		if (isLoading) return;

		errorMessage = "";
		successMessage = "";

		// Validasi apakah role masih tersedia
		if (regRole === "admin" && !rolesStatus.adminAvailable) {
			triggerShake("Akun Admin sudah terdaftar! Demi keamanan sistem, tidak bisa membuat akun Admin lagi.");
			return;
		}
		if (regRole === "boss" && !rolesStatus.bossAvailable) {
			triggerShake("Kuota akun Boss / Atasan sudah penuh (maksimal 2 akun)! Demi keamanan sistem, tidak bisa membuat akun Boss lagi.");
			return;
		}

		if (!regName.trim()) {
			triggerShake("Nama lengkap wajib diisi");
			return;
		}
		if (!regUsername.trim() || regUsername.trim().length < 3) {
			triggerShake("Username minimal 3 karakter");
			return;
		}
		if (!regPassword || regPassword.length < 6) {
			triggerShake("Password minimal 6 karakter");
			return;
		}
		if (!regPin || !/^\d{6}$/.test(regPin.trim())) {
			triggerShake("PIN keamanan harus tepat 6 digit angka");
			return;
		}

		isLoading = true;

		try {
			const res = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: regName,
					username: regUsername,
					password: regPassword,
					pin: regPin,
					role: regRole,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				triggerShake(data.error || "Gagal mendaftarkan akun");
				await refreshRolesStatus();
				return;
			}

			// Sukses Registrasi!
			sound.playAman();
			mascotMode = "success";
			successMessage = data.message || `Akun ${regRole === "boss" ? "Boss / Atasan" : "Admin"} berhasil didaftarkan! Silakan masuk.`;
			username = regUsername;
			password = "";

			// Reset form register
			regName = "";
			regUsername = "";
			regPassword = "";
			regPin = "";

			await refreshRolesStatus();

			setTimeout(() => {
				authMode = "login";
				step = 1;
				mascotMode = "idle";
			}, 1200);
		} catch (err) {
			triggerShake("Gagal menghubungi server. Periksa koneksi Anda.");
		} finally {
			isLoading = false;
		}
	}

	// Step 2 PIN Inputs
	function handlePinInput(index: number, e: Event) {
		const target = e.target as HTMLInputElement;
		const val = target.value.replace(/[^0-9]/g, "");
		pinDigits[index] = val ? val.slice(-1) : "";

		if (pinDigits[index] && index < 5) {
			pinInputs[index + 1]?.focus();
		}

		// Jika seluruh 6 digit terisi otomatis submit
		if (pinDigits.every((d) => d !== "")) {
			submitPin();
		}
	}

	function handlePinKeyDown(index: number, e: KeyboardEvent) {
		if (e.key === "Backspace") {
			if (!pinDigits[index] && index > 0) {
				pinDigits[index - 1] = "";
				pinInputs[index - 1]?.focus();
			} else {
				pinDigits[index] = "";
			}
		}
	}

	function handleKeypadClick(num: string) {
		const emptyIdx = pinDigits.findIndex((d) => d === "");
		if (emptyIdx !== -1) {
			pinDigits[emptyIdx] = num;
			if (emptyIdx < 5) {
				pinInputs[emptyIdx + 1]?.focus();
			}
			if (pinDigits.every((d) => d !== "")) {
				submitPin();
			}
		}
	}

	function handleKeypadBackspace() {
		for (let i = 5; i >= 0; i--) {
			if (pinDigits[i] !== "") {
				pinDigits[i] = "";
				pinInputs[i]?.focus();
				break;
			}
		}
	}

	// Step 2 Submit (PIN Verification)
	async function submitPin() {
		const pin = pinDigits.join("");
		if (pin.length < 6) {
			triggerShake("Masukkan 6 digit PIN lengkap");
			return;
		}

		if (isLoading) return;
		isLoading = true;
		errorMessage = "";

		try {
			const res = await fetch("/api/auth/login-step2", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ temp_token: tempToken, pin }),
			});

			const data = await res.json();

			if (!res.ok) {
				triggerShake(data.error || "PIN verifikasi salah");
				pinDigits = ["", "", "", "", "", ""];
				setTimeout(() => pinInputs[0]?.focus(), 200);
				return;
			}

			// Sukses Login!
			mascotMode = "success";
			sound.playAman();

			setTimeout(() => {
				window.location.href = "/";
			}, 900);
		} catch (err) {
			triggerShake("Gagal verifikasi PIN. Silakan coba lagi.");
		} finally {
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{authMode === 'login' ? 'Masuk' : 'Daftar Akun'} - Sistem Rekapan Keuangan</title>
</svelte:head>

<div class="login-wrapper">
	<!-- Top Navigation (Theme Switcher) -->
	<header class="login-top-nav">
		<div class="brand">
			<span class="brand-icon">💎</span>
			<span class="brand-name">OS Hutang Finance</span>
		</div>

		<button
			type="button"
			class="btn-theme-toggle"
			onclick={toggleTheme}
			title="Ganti Mode Tampilan (Terang / Gelap)"
		>
			<span>{$theme === "dark" ? "☀️" : "🌙"}</span>
			<span>{$theme === "dark" ? "Mode Terang" : "Mode Gelap"}</span>
		</button>
	</header>

	<!-- Centered Cute Card -->
	<main class="login-main">
		<div class="login-card-container" class:shake={isShaking}>
			<!-- YETI ANIMATED MASCOT -->
			<div class="mascot-wrapper">
				<CatMascot
					mode={mascotMode}
					charCount={authMode === 'register' ? (regUsername.length || regName.length) : username.length}
					maxChars={20}
				/>
			</div>

			<div class="login-card">
				<!-- Segmented Switcher Tab (Only on Step 1) -->
				{#if step === 1}
					<div class="auth-tabs">
						<button
							type="button"
							class="auth-tab-btn"
							class:active={authMode === "login"}
							onclick={() => {
								authMode = "login";
								errorMessage = "";
								successMessage = "";
								mascotMode = "idle";
							}}
						>
							🔑 Masuk (Login)
						</button>
						<button
							type="button"
							class="auth-tab-btn"
							class:active={authMode === "register"}
							onclick={() => {
								authMode = "register";
								errorMessage = "";
								successMessage = "";
								mascotMode = "idle";
							}}
						>
							📝 Daftar Akun {#if rolesStatus.allFull}<span class="badge-tab-locked">🔒 Terisi Penuh</span>{/if}
						</button>
					</div>
				{/if}

				{#if successMessage}
					<div class="success-banner">
						<span>🎉</span>
						<span>{successMessage}</span>
					</div>
				{/if}

				{#if errorMessage}
					<div class="error-banner">
						<span>⚠️</span>
						<span>{errorMessage}</span>
					</div>
				{/if}

				{#if authMode === "register"}
					<!-- ================ TAB REGISTER: DAFTAR AKUN BARU ================ -->
					{#if rolesStatus.allFull}
						<!-- Banner Terkunci Jika Kedua Akun (Admin & Boss) Sudah Terisi -->
						<div class="registration-locked-banner">
							<div class="locked-icon">🛡️🔒</div>
							<h2 class="locked-title">Pendaftaran Akun Ditutup</h2>
							<p class="locked-desc">
								Akun <strong>Admin Keuangan</strong> dan <strong>Boss / Atasan</strong> sudah terdaftar secara resmi di sistem. Demi keamanan rekapan keuangan, tidak diperkenankan membuat akun tambahan.
							</p>
							<button
								type="button"
								class="btn-submit"
								style="margin-top: 1.25rem; width: 100%;"
								onclick={() => {
									authMode = "login";
									errorMessage = "";
								}}
							>
								Menuju Halaman Masuk (Login) ➔
							</button>
						</div>
					{:else}
						<div class="card-header">
							<h1 class="card-title">Registrasi Akun Baru ✨</h1>
							<p class="card-desc">
								Pilih peran yang masih tersedia (maksimal 1 Admin &amp; 2 Boss)
							</p>
						</div>

						<form onsubmit={handleRegisterSubmit} class="login-form">
							<!-- Pilihan Peran (Role) dengan Status Kunci -->
							<div class="form-group">
								<label class="form-label">Pilih Peran / Jabatan</label>
								<div class="role-selector-grid">
									<!-- Card Admin -->
									<button
										type="button"
										class="role-card"
										class:selected={regRole === "admin" && rolesStatus.adminAvailable}
										class:disabled-role={!rolesStatus.adminAvailable}
										onclick={() => {
											if (!rolesStatus.adminAvailable) {
												triggerShake("Akun Admin sudah terdaftar dan tidak dapat dibuat lagi demi keamanan.");
											} else {
												regRole = "admin";
											}
										}}
									>
										<span class="role-icon">🛡️</span>
										<div class="role-text">
											<div class="role-title">Admin Keuangan</div>
											<div class="role-sub">
												{rolesStatus.adminAvailable ? "Input bon & saldo harian" : "Akun sudah terdaftar"}
											</div>
										</div>
										{#if !rolesStatus.adminAvailable}
											<span class="role-badge-locked">🔒 Terisi</span>
										{:else if regRole === "admin"}
											<span class="role-badge-check">✓</span>
										{/if}
									</button>

									<!-- Card Boss -->
									<button
										type="button"
										class="role-card"
										class:selected={regRole === "boss" && rolesStatus.bossAvailable}
										class:disabled-role={!rolesStatus.bossAvailable}
										onclick={() => {
											if (!rolesStatus.bossAvailable) {
												triggerShake("Kuota akun Boss sudah penuh (maksimal 2 akun).");
											} else {
												regRole = "boss";
											}
										}}
									>
										<span class="role-icon">👑</span>
										<div class="role-text">
											<div class="role-title">Boss / Atasan</div>
											<div class="role-sub">
												{#if rolesStatus.bossAvailable}
													{#if (rolesStatus.bossCount ?? 0) > 0}
														Persetujuan ACC (Sisa 1 slot dari 2 Boss)
													{:else}
														Persetujuan ACC & audit (Maks. 2 akun)
													{/if}
												{:else}
													Kuota 2 akun sudah penuh
												{/if}
											</div>
										</div>
										{#if !rolesStatus.bossAvailable}
											<span class="role-badge-locked">🔒 Penuh (2/2)</span>
										{:else if (rolesStatus.bossCount ?? 0) > 0}
											<span class="role-badge-quota">1/2 Terisi</span>
										{:else if regRole === "boss"}
											<span class="role-badge-check">✓</span>
										{/if}
									</button>
								</div>
							</div>

							<!-- Input Nama Lengkap -->
							<div class="form-group">
								<label for="reg-name">Nama Lengkap</label>
								<div class="input-icon-wrapper">
									<span class="input-icon">🏷️</span>
									<input
										id="reg-name"
										type="text"
										bind:value={regName}
										onfocus={() => handleRegFocus("name")}
										onblur={handleRegBlur}
										placeholder="Contoh: Budi Santoso / Pak Denny"
										required
									/>
								</div>
							</div>

							<!-- Input Username -->
							<div class="form-group">
								<label for="reg-username">Username</label>
								<div class="input-icon-wrapper">
									<span class="input-icon">👤</span>
									<input
										id="reg-username"
										type="text"
										bind:value={regUsername}
										onfocus={() => handleRegFocus("username")}
										onblur={handleRegBlur}
										placeholder="Username unik..."
										required
										autocomplete="username"
									/>
								</div>
							</div>

							<!-- Input Password -->
							<div class="form-group">
								<label for="reg-password">Password</label>
								<div class="input-icon-wrapper">
									<span class="input-icon">🔒</span>
									<input
										id="reg-password"
										type={showRegPassword ? "text" : "password"}
										bind:value={regPassword}
										onfocus={() => handleRegFocus("password")}
										onblur={handleRegBlur}
										placeholder="Minimal 6 karakter..."
										required
										autocomplete="new-password"
									/>
									<button
										type="button"
										class="btn-toggle-eye"
										onclick={() => {
											showRegPassword = !showRegPassword;
											mascotMode = showRegPassword ? "peek" : "password";
										}}
										title={showRegPassword ? "Sembunyikan password" : "Lihat password"}
									>
										{showRegPassword ? "🙈" : "👁️"}
									</button>
								</div>
							</div>

							<!-- Input PIN Keamanan 6 Digit -->
							<div class="form-group">
								<div style="display:flex; justify-content:space-between; align-items:center;">
									<label for="reg-pin">PIN Keamanan (6 Digit Angka)</label>
									<span class="pin-hint-tag">Tepat 6 Angka</span>
								</div>
								<div class="input-icon-wrapper">
									<span class="input-icon">🔢</span>
									<input
										id="reg-pin"
										type={showRegPin ? "text" : "password"}
										inputmode="numeric"
										pattern="[0-9]*"
										maxlength="6"
										bind:value={regPin}
										onfocus={() => handleRegFocus("pin")}
										onblur={handleRegBlur}
										placeholder="6 Digit PIN otentikasi..."
										required
									/>
									<button
										type="button"
										class="btn-toggle-eye"
										onclick={() => (showRegPin = !showRegPin)}
										title={showRegPin ? "Sembunyikan PIN" : "Lihat PIN"}
									>
										{showRegPin ? "🙈" : "👁️"}
									</button>
								</div>
							</div>

							<button
								type="submit"
								class="btn-submit"
								disabled={isLoading || (regRole === 'admin' && !rolesStatus.adminAvailable) || (regRole === 'boss' && !rolesStatus.bossAvailable)}
							>
								{#if isLoading}
									<span class="spinner"></span> Mendaftarkan...
								{:else}
									Daftar Akun {regRole === "boss" ? "Boss" : "Admin"} ✨
								{/if}
							</button>

							<div class="auth-switch-link">
								Sudah punya akun?
								<button
									type="button"
									class="link-action"
									onclick={() => {
										authMode = "login";
										errorMessage = "";
									}}
								>
									Masuk ke Sistem ➔
								</button>
							</div>
						</form>
					{/if}
				{:else if step === 1}
					<!-- ================ TAB LOGIN: STEP 1 (USERNAME & PASSWORD) ================ -->
					<div class="card-header">
						<h1 class="card-title">Masuk ke Sistem 🌸</h1>
						<p class="card-desc">
							Silakan masukkan username dan password Anda untuk melanjutkan
						</p>
					</div>

					<form onsubmit={handleStep1Submit} class="login-form">
						<!-- Input Username -->
						<div class="form-group">
							<label for="username">Username</label>
							<div class="input-icon-wrapper">
								<span class="input-icon">👤</span>
								<input
									id="username"
									type="text"
									bind:value={username}
									onfocus={handleUsernameFocus}
									onblur={handleUsernameBlur}
									placeholder="Masukkan username..."
									required
									autocomplete="username"
								/>
							</div>
						</div>

						<!-- Input Password -->
						<div class="form-group">
							<label for="password">Password</label>
							<div class="input-icon-wrapper">
								<span class="input-icon">🔒</span>
								<input
									id="password"
									type={showPassword ? "text" : "password"}
									bind:value={password}
									onfocus={handlePasswordFocus}
									onblur={handlePasswordBlur}
									placeholder="Masukkan password..."
									required
									autocomplete="current-password"
								/>
								<button
									type="button"
									class="btn-toggle-eye"
									onclick={toggleShowPassword}
									title={showPassword
										? "Sembunyikan password"
										: "Lihat password"}
								>
									{showPassword ? "🙈" : "👁️"}
								</button>
							</div>
						</div>

						<button
							type="submit"
							class="btn-submit"
							disabled={isLoading}
						>
							{#if isLoading}
								<span class="spinner"></span> Memeriksa...
							{:else}
								Lanjut ke Verifikasi PIN ➔
							{/if}
						</button>

						<div class="auth-switch-link">
							{#if rolesStatus.allFull}
								<span class="secure-badge">🛡️ Pendaftaran ditutup &bull; Akun Admin &amp; Boss telah diamankan</span>
							{:else}
								Belum punya akun?
								<button
									type="button"
									class="link-action"
									onclick={() => {
										authMode = "register";
										errorMessage = "";
									}}
								>
									Daftar Akun Admin / Boss ✨
								</button>
							{/if}
						</div>
					</form>
				{:else}
					<!-- ================ TAB LOGIN: STEP 2 (PIN 6-DIGIT) ================ -->
					<div class="card-header">
						<h1 class="card-title">Verifikasi PIN Keamanan ✨</h1>
						<p class="card-desc">
							Masukkan 6-digit PIN keamanan untuk akun <strong
								>{username}</strong
							>
						</p>
					</div>

					<!-- PIN 6 Digit Boxes -->
					<div class="pin-boxes-container">
						{#each pinDigits as digit, i}
							<input
								bind:this={pinInputs[i]}
								id="pin-{i}"
								type="password"
								inputmode="numeric"
								pattern="[0-9]*"
								maxlength="1"
								class="pin-digit-box"
								class:filled={digit !== ""}
								value={digit}
								oninput={(e) => handlePinInput(i, e)}
								onkeydown={(e) => handlePinKeyDown(i, e)}
								onfocus={() => {
									if (mascotMode !== "success")
										mascotMode = "pin";
								}}
								autocomplete="off"
							/>
						{/each}
					</div>

					<!-- Virtual Cute Keypad for PIN -->
					<div class="keypad-container">
						{#each ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as num}
							<button
								type="button"
								class="keypad-btn"
								onclick={() => handleKeypadClick(num)}
							>
								{num}
							</button>
						{/each}
						<button
							type="button"
							class="keypad-btn btn-ghost-key"
							onclick={() => {
								step = 1;
								mascotMode = "idle";
								errorMessage = "";
							}}
						>
							←
						</button>
						<button
							type="button"
							class="keypad-btn"
							onclick={() => handleKeypadClick("0")}
						>
							0
						</button>
						<button
							type="button"
							class="keypad-btn btn-del-key"
							onclick={handleKeypadBackspace}
							title="Hapus digit"
						>
							⌫
						</button>
					</div>

					<div class="pin-actions">
						<button
							type="button"
							class="btn-back"
							onclick={() => {
								step = 1;
								mascotMode = "idle";
								errorMessage = "";
							}}
						>
							← Batal
						</button>
						<button
							type="button"
							class="btn-submit"
							style="flex:1;"
							disabled={isLoading ||
								pinDigits.some((d) => d === "")}
							onclick={submitPin}
						>
							{#if isLoading}
								<span class="spinner"></span> Memverifikasi...
							{:else}
								Verifikasi & Masuk ✨
							{/if}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</main>
</div>

<style>
	/* Fullscreen background */
	.login-wrapper {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: linear-gradient(
			135deg,
			#fff0f5 0%,
			#fce7f3 50%,
			#fed7e2 100%
		);
		transition: background 0.3s ease;
		font-family: "Inter", system-ui, -apple-system, sans-serif;
	}

	:global([data-theme="dark"]) .login-wrapper {
		background: linear-gradient(
			135deg,
			#13081e 0%,
			#1f0f30 50%,
			#29113d 100%
		);
	}

	.login-top-nav {
		padding: 1.25rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.brand-icon {
		font-size: 1.5rem;
	}

	.brand-name {
		font-weight: 800;
		font-size: 1.15rem;
		color: #831843;
		letter-spacing: -0.3px;
	}

	:global([data-theme="dark"]) .brand-name {
		color: #f472b6;
	}

	.btn-theme-toggle {
		background: rgba(255, 255, 255, 0.7);
		border: 1px solid rgba(244, 114, 182, 0.3);
		backdrop-filter: blur(8px);
		padding: 0.45rem 0.9rem;
		border-radius: 999px;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #831843;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	:global([data-theme="dark"]) .btn-theme-toggle {
		background: rgba(30, 16, 45, 0.7);
		border-color: rgba(244, 114, 182, 0.2);
		color: #fbcfe8;
	}

	.btn-theme-toggle:hover {
		transform: translateY(-1px);
	}

	.login-main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem 1rem 3rem;
	}

	.login-card-container {
		width: 100%;
		max-width: 460px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	/* Shake animation on error */
	.shake {
		animation: shakeAnim 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	@keyframes shakeAnim {
		10%,
		90% {
			transform: translate3d(-2px, 0, 0);
		}
		20%,
		80% {
			transform: translate3d(4px, 0, 0);
		}
		30%,
		50%,
		70% {
			transform: translate3d(-6px, 0, 0);
		}
		40%,
		60% {
			transform: translate3d(6px, 0, 0);
		}
	}

	.mascot-wrapper {
		margin-bottom: -2rem;
		z-index: 10;
		filter: drop-shadow(0 10px 15px rgba(0, 0, 0, 0.1));
	}

	.login-card {
		width: 100%;
		background: #ffffff;
		border-radius: 20px;
		border: 1px solid #fbcfe8;
		padding: 2.2rem 2rem 2rem;
		box-shadow:
			0 20px 40px -10px rgba(244, 63, 94, 0.15),
			0 10px 20px -5px rgba(236, 72, 153, 0.1);
		transition:
			background 0.3s ease,
			border-color 0.3s ease;
	}

	:global([data-theme="dark"]) .login-card {
		background: #1e102d;
		border-color: #3e1e5b;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}

	/* Segmented Auth Tabs */
	.auth-tabs {
		display: flex;
		background: #fdf2f8;
		padding: 0.3rem;
		border-radius: 12px;
		margin-bottom: 1.5rem;
		gap: 0.3rem;
		border: 1px solid #fce7f3;
	}

	:global([data-theme="dark"]) .auth-tabs {
		background: #150921;
		border-color: #37174e;
	}

	.auth-tab-btn {
		flex: 1;
		padding: 0.55rem 0.5rem;
		border: none;
		background: transparent;
		color: #64748b;
		font-size: 0.82rem;
		font-weight: 700;
		border-radius: 9px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
	}

	:global([data-theme="dark"]) .auth-tab-btn {
		color: #94a3b8;
	}

	.auth-tab-btn.active {
		background: #ffffff;
		color: #be185d;
		box-shadow: 0 2px 8px rgba(190, 24, 93, 0.12);
	}

	:global([data-theme="dark"]) .auth-tab-btn.active {
		background: #2b123d;
		color: #f472b6;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	.badge-tab-locked {
		font-size: 0.65rem;
		background: #fee2e2;
		color: #b91c1c;
		padding: 0.1rem 0.35rem;
		border-radius: 999px;
		font-weight: 800;
	}

	:global([data-theme="dark"]) .badge-tab-locked {
		background: #450a0a;
		color: #fca5a5;
	}

	.card-header {
		text-align: center;
		margin-bottom: 1.25rem;
	}

	.card-title {
		font-size: 1.35rem;
		font-weight: 800;
		color: #0f172a;
		letter-spacing: -0.3px;
	}

	:global([data-theme="dark"]) .card-title {
		color: #f8fafc;
	}

	.card-desc {
		font-size: 0.82rem;
		color: #64748b;
		margin-top: 0.35rem;
	}

	:global([data-theme="dark"]) .card-desc {
		color: #94a3b8;
	}

	.error-banner {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #991b1b;
		padding: 0.6rem 0.85rem;
		border-radius: 10px;
		font-size: 0.82rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.2rem;
		animation: fadeIn 0.2s ease;
	}

	:global([data-theme="dark"]) .error-banner {
		background: #3f1218;
		border-color: #7f1d1d;
		color: #fca5a5;
	}

	.success-banner {
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		color: #166534;
		padding: 0.65rem 0.85rem;
		border-radius: 10px;
		font-size: 0.82rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.2rem;
		animation: fadeIn 0.2s ease;
		font-weight: 600;
	}

	:global([data-theme="dark"]) .success-banner {
		background: #0f2e1b;
		border-color: #14532d;
		color: #86efac;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Registration Locked Banner */
	.registration-locked-banner {
		text-align: center;
		padding: 1.75rem 1.25rem;
		background: #fdf2f8;
		border: 1.5px solid #fbcfe8;
		border-radius: 16px;
		margin-top: 0.5rem;
	}

	:global([data-theme="dark"]) .registration-locked-banner {
		background: #230d33;
		border-color: #4b1968;
	}

	.locked-icon {
		font-size: 2.5rem;
		margin-bottom: 0.6rem;
		line-height: 1;
	}

	.locked-title {
		font-size: 1.1rem;
		font-weight: 800;
		color: #9d174d;
		margin-bottom: 0.4rem;
	}

	:global([data-theme="dark"]) .locked-title {
		color: #f472b6;
	}

	.locked-desc {
		font-size: 0.82rem;
		color: #64748b;
		line-height: 1.5;
	}

	:global([data-theme="dark"]) .locked-desc {
		color: #cbd5e1;
	}

	/* Role Selector Cards */
	.role-selector-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		margin-top: 0.3rem;
	}

	.role-card {
		padding: 0.65rem 0.75rem;
		border-radius: 12px;
		border: 1.5px solid #e2e8f0;
		background: #f8fafc;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		position: relative;
		transition: all 0.2s ease;
		text-align: left;
	}

	:global([data-theme="dark"]) .role-card {
		background: #180c26;
		border-color: #3b1954;
	}

	.role-card:hover:not(.disabled-role) {
		border-color: #f472b6;
		transform: translateY(-1px);
	}

	.role-card.selected {
		border-color: #ec4899;
		background: #fdf2f8;
		box-shadow: 0 4px 12px rgba(236, 72, 153, 0.15);
	}

	:global([data-theme="dark"]) .role-card.selected {
		border-color: #ec4899;
		background: #2f123f;
	}

	.role-card.disabled-role {
		opacity: 0.55;
		cursor: not-allowed;
		background: #f1f5f9;
		border-color: #cbd5e1;
	}

	:global([data-theme="dark"]) .role-card.disabled-role {
		background: #100619;
		border-color: #2c123d;
	}

	.role-icon {
		font-size: 1.25rem;
	}

	.role-text {
		flex: 1;
		min-width: 0;
	}

	.role-title {
		font-size: 0.82rem;
		font-weight: 700;
		color: #0f172a;
	}

	:global([data-theme="dark"]) .role-title {
		color: #f8fafc;
	}

	.role-sub {
		font-size: 0.68rem;
		color: #64748b;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	:global([data-theme="dark"]) .role-sub {
		color: #94a3b8;
	}

	.role-badge-check {
		position: absolute;
		top: 6px;
		right: 6px;
		background: #ec4899;
		color: white;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.65rem;
		font-weight: 900;
	}

	.role-badge-locked {
		position: absolute;
		top: 6px;
		right: 6px;
		background: #ef4444;
		color: white;
		font-size: 0.6rem;
		font-weight: 800;
		padding: 0.1rem 0.35rem;
		border-radius: 999px;
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}

	.role-badge-quota {
		position: absolute;
		top: 6px;
		right: 6px;
		background: #f59e0b;
		color: white;
		font-size: 0.6rem;
		font-weight: 800;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}

	.pin-hint-tag {
		font-size: 0.68rem;
		background: #fce7f3;
		color: #be185d;
		padding: 0.15rem 0.45rem;
		border-radius: 6px;
		font-weight: 700;
	}

	:global([data-theme="dark"]) .pin-hint-tag {
		background: #3b1735;
		color: #f472b6;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	label,
	.form-label {
		font-size: 0.82rem;
		font-weight: 700;
		color: #334155;
	}

	:global([data-theme="dark"]) label,
	:global([data-theme="dark"]) .form-label {
		color: #cbd5e1;
	}

	.input-icon-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-icon {
		position: absolute;
		left: 0.9rem;
		font-size: 0.95rem;
		color: #94a3b8;
		pointer-events: none;
	}

	.input-icon-wrapper input {
		width: 100%;
		padding: 0.75rem 2.5rem 0.75rem 2.45rem;
		border: 1.5px solid #e2e8f0;
		border-radius: 12px;
		font-size: 0.88rem;
		background: #f8fafc;
		color: #0f172a;
		outline: none;
		transition: all 0.2s ease;
	}

	:global([data-theme="dark"]) .input-icon-wrapper input {
		background: #150921;
		border-color: #37174e;
		color: #f8fafc;
	}

	.input-icon-wrapper input:focus {
		border-color: #ec4899;
		background: #ffffff;
		box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.15);
	}

	:global([data-theme="dark"]) .input-icon-wrapper input:focus {
		background: #200d33;
		border-color: #ec4899;
		box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.25);
	}

	.btn-toggle-eye {
		position: absolute;
		right: 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.95rem;
		opacity: 0.6;
		transition: opacity 0.15s;
		padding: 0.25rem;
	}

	.btn-toggle-eye:hover {
		opacity: 1;
	}

	.btn-submit {
		margin-top: 0.35rem;
		padding: 0.85rem;
		border: none;
		border-radius: 12px;
		background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
		color: #ffffff;
		font-size: 0.92rem;
		font-weight: 700;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		box-shadow: 0 10px 20px -5px rgba(236, 72, 153, 0.35);
		transition: all 0.2s ease;
	}

	.btn-submit:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 14px 25px -5px rgba(236, 72, 153, 0.45);
	}

	.btn-submit:active:not(:disabled) {
		transform: translateY(0);
	}

	.btn-submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.auth-switch-link {
		text-align: center;
		font-size: 0.8rem;
		color: #64748b;
		margin-top: 0.4rem;
	}

	:global([data-theme="dark"]) .auth-switch-link {
		color: #94a3b8;
	}

	.link-action {
		background: none;
		border: none;
		color: #db2777;
		font-weight: 700;
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0.2rem 0.4rem;
		text-decoration: underline;
		transition: color 0.15s;
	}

	:global([data-theme="dark"]) .link-action {
		color: #f472b6;
	}

	.link-action:hover {
		color: #9d174d;
	}

	.secure-badge {
		font-size: 0.76rem;
		color: #64748b;
		font-weight: 600;
	}

	:global([data-theme="dark"]) .secure-badge {
		color: #94a3b8;
	}

	/* PIN Box Styling */
	.pin-boxes-container {
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		margin: 1.2rem 0 1.5rem;
	}

	.pin-digit-box {
		width: 44px;
		height: 52px;
		border: 2px solid #e2e8f0;
		border-radius: 12px;
		background: #f8fafc;
		font-size: 1.5rem;
		font-weight: 800;
		text-align: center;
		color: #0f172a;
		outline: none;
		transition: all 0.2s ease;
	}

	:global([data-theme="dark"]) .pin-digit-box {
		background: #150921;
		border-color: #37174e;
		color: #f8fafc;
	}

	.pin-digit-box:focus {
		border-color: #ec4899;
		background: #ffffff;
		box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.2);
		transform: scale(1.05);
	}

	:global([data-theme="dark"]) .pin-digit-box:focus {
		background: #250f38;
	}

	.pin-digit-box.filled {
		border-color: #db2777;
		background: #fdf2f8;
	}

	:global([data-theme="dark"]) .pin-digit-box.filled {
		background: #2c123d;
		border-color: #f472b6;
	}

	/* Virtual Keypad */
	.keypad-container {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
		max-width: 270px;
		margin: 0 auto;
	}

	.keypad-btn {
		height: 48px;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		background: #f8fafc;
		font-size: 1.2rem;
		font-weight: 700;
		color: #0f172a;
		cursor: pointer;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global([data-theme="dark"]) .keypad-btn {
		background: #150921;
		border-color: #37174e;
		color: #f8fafc;
	}

	.keypad-btn:hover {
		background: #e2e8f0;
		transform: scale(1.04);
	}

	:global([data-theme="dark"]) .keypad-btn:hover {
		background: #334155;
	}

	.btn-ghost-key {
		font-size: 0.95rem;
		color: #64748b;
	}

	.btn-del-key {
		color: #dc2626;
	}

	.pin-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: 1.25rem;
		align-items: center;
	}

	.btn-back {
		padding: 0.8rem 0.9rem;
		border-radius: 10px;
		background: #f1f5f9;
		border: 1px solid #cbd5e1;
		font-size: 0.85rem;
		font-weight: 700;
		color: #475569;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
	}

	:global([data-theme="dark"]) .btn-back {
		background: #0f172a;
		border-color: #334155;
		color: #cbd5e1;
	}

	.btn-back:hover {
		background: #e2e8f0;
	}

	.spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: #ffffff;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
