<script lang="ts">
	import type { PageData, ActionData } from "./$types";
	import type { Debt } from "$lib/types";
	import { enhance } from "$app/forms";
	import { invalidateAll } from "$app/navigation";
	import { sound } from "$lib/sound";
	import { theme, toggleTheme, initTheme } from "$lib/theme";
	import CatLogoIcon from "$lib/components/CatLogoIcon.svelte";
	import { onMount } from "svelte";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Halaman aktif sidebar: 'debts' | 'pending_approval' | 'history' | 'balance'
	let page = $state<"debts" | "pending_approval" | "history" | "balance">(
		"debts",
	);

	// Pengecekan peran Atasan (Boss)
	let isBoss = $derived(
		data.currentUser?.role === "boss"

	);

	// Filter aging di halaman debts & halaman menunggu ACC
	let agingFilter = $state<
		"all" | "0-30" | "31-60" | "61-90" | "91-120" | ">120"
	>("all");
	let pendingAgingFilter = $state<
		"all" | "0-30" | "31-60" | "61-90" | "91-120" | ">120"
	>("all");
	let search = $state("");

	// Modal tambah tagihan
	let showAdd = $state(false);
	let hasDueDate = $state(false);
	let isNewSupplier = $state(false);
	let selectedContactId = $state("");
	let addAmountFormatted = $state("");
	let addContactType = $state<"supplier" | "non_vendor">("supplier");

	// Modal Edit Tagihan
	let showEdit = $state(false);
	let editDebtTarget = $state<any>(null);
	let editContactName = $state("");
	let editContactType = $state<"supplier" | "non_vendor">("supplier");
	let editInvoiceNo = $state("");
	let editInvoiceDate = $state("");
	let editHasDue = $state(false);
	let editDueDate = $state("");
	let editAmountFormatted = $state("");
	let editDescription = $state("");

	// Modal bayar / minta ACC
	let showPay = $state(false);
	let payDebt = $state<Debt | null>(null);
	let payAmountFormatted = $state("");
	let payAmountRaw = $derived(
		parseInt(payAmountFormatted.replace(/\D/g, "") || "0", 10),
	);

	// Modal persetujuan (ACC & Tolak)
	let showRejectModal = $state(false);
	let rejectTargetDebt = $state<Debt | null>(null);
	let rejectReason = $state("");

	function getLocalTodayISO(): string {
		const d = new Date();
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		return `${yyyy}-${mm}-${dd}`;
	}

	let showApproveModal = $state(false);
	let approveTargetDebt = $state<Debt | null>(null);
	let isWaApproval = $state(false);
	let waApproverName = $state("Pak Danny / Pak Carmen");
	let approvePaymentDate = $state(getLocalTodayISO());

	// Pengaturan Download / Export Per Hari di Menu Sudah Dibayar
	let exportPaidMode = $state<"daily" | "period">("daily");
	let exportPaidDate = $state<string>(getLocalTodayISO());

	// Search di tab Menunggu ACC
	let pendingSearch = $state("");
	let paidSearch = $state("");

	// State urutan (Sort A-Z / Z-A / Tanggal)
	let debtSortBy = $state<
		"date_desc" | "date_asc" | "name_asc" | "name_desc"
	>("date_desc");
	let paidSortBy = $state<
		| "date_desc"
		| "date_asc"
		| "nota_desc"
		| "nota_asc"
		| "name_asc"
		| "name_desc"
	>("date_desc");
	let pendingSortBy = $state<
		"expiry_asc" | "aging_desc" | "date_desc" | "date_asc" | "name_asc" | "name_desc"
	>("expiry_asc");

	// State Countdown Real-Time (per detik) & Jangka Hari Kadaluarsa ACC
	let nowTick = $state<number>(Date.now());
	let isAutoExpiring = false;

	function addDaysISO(baseIso: string, days: number): string {
		const parts = baseIso.split("-");
		const d =
			parts.length === 3
				? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
				: new Date();
		d.setDate(d.getDate() + Math.max(0, Math.round(days)));
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		return `${yyyy}-${mm}-${dd}`;
	}

	let accExpireDays = $state<number>(3);
	let payTargetDate = $state<string>(addDaysISO(getLocalTodayISO(), 3));

	function handleExpireDaysChange(daysVal: number) {
		const cleanDays = Math.max(1, Math.min(365, Math.round(daysVal || 1)));
		accExpireDays = cleanDays;
		payTargetDate = addDaysISO(getLocalTodayISO(), cleanDays);
	}

	function handlePayTargetDateChange(newDateStr: string) {
		payTargetDate = newDateStr;
		const todayParts = getLocalTodayISO().split("-");
		const targetParts = newDateStr.split("-");
		if (todayParts.length === 3 && targetParts.length === 3) {
			const t0 = new Date(
				Number(todayParts[0]),
				Number(todayParts[1]) - 1,
				Number(todayParts[2]),
			).getTime();
			const t1 = new Date(
				Number(targetParts[0]),
				Number(targetParts[1]) - 1,
				Number(targetParts[2]),
			).getTime();
			const diffDays = Math.round((t1 - t0) / 86400000);
			accExpireDays = Math.max(1, diffDays);
		}
	}

	function formatAccCountdown(
		expiresTs?: number | null,
		nowMs: number = nowTick,
	): {
		text: string;
		sub: string;
		level: "none" | "safe" | "warning" | "critical" | "expired";
	} {
		if (!expiresTs) {
			return { text: "Tanpa Batas Waktu", sub: "Menunggu ACC", level: "none" };
		}
		const diffMs = expiresTs - nowMs;
		if (diffMs <= 0) {
			return {
				text: "0h : 00j : 00m : 00d",
				sub: "Kadaluarsa — Kembali ke OS Hutang",
				level: "expired",
			};
		}
		const totalSec = Math.floor(diffMs / 1000);
		const days = Math.floor(totalSec / 86400);
		const hours = Math.floor((totalSec % 86400) / 3600);
		const mins = Math.floor((totalSec % 3600) / 60);
		const secs = totalSec % 60;

		const hh = String(hours).padStart(2, "0");
		const mm = String(mins).padStart(2, "0");
		const ss = String(secs).padStart(2, "0");
		const text = `${days}h : ${hh}j : ${mm}m : ${ss}d`;

		if (diffMs <= 6 * 3600 * 1000) {
			return { text, sub: "🚨 Prioritas Kritis (< 6 Jam)", level: "critical" };
		}
		if (diffMs <= 24 * 3600 * 1000) {
			return { text, sub: "⚠️ Segera Habis (< 1 Hari)", level: "warning" };
		}
		return { text, sub: "⏳ Hitung Mundur Aktif", level: "safe" };
	}

	function sortDebtItems(
		list: any[],
		sortMode: string,
		usePaymentDate: boolean = false,
	) {
		return [...list].sort((a, b) => {
			if (sortMode === "expiry_asc") {
				const expA = a.pending_expires_ts ? Number(a.pending_expires_ts) : Number.MAX_SAFE_INTEGER;
				const expB = b.pending_expires_ts ? Number(b.pending_expires_ts) : Number.MAX_SAFE_INTEGER;
				if (expA !== expB) return expA - expB;
				return (b.days_overdue || 0) - (a.days_overdue || 0);
			}
			if (sortMode === "aging_desc") {
				const odDiff = (b.days_overdue || 0) - (a.days_overdue || 0);
				if (odDiff !== 0) return odDiff;
				return (a.invoice_date || "").localeCompare(b.invoice_date || "");
			}
			const dateA = usePaymentDate
				? a.payment_date || a.invoice_date || ""
				: a.invoice_date || "";
			const dateB = usePaymentDate
				? b.payment_date || b.invoice_date || ""
				: b.invoice_date || "";
			if (sortMode === "name_asc") {
				const cmp = (a.contact_name || "").localeCompare(
					b.contact_name || "",
					"id",
					{ sensitivity: "base" },
				);
				if (cmp !== 0) return cmp;
				return (b.invoice_date || "").localeCompare(
					a.invoice_date || "",
				);
			}
			if (sortMode === "name_desc") {
				const cmp = (b.contact_name || "").localeCompare(
					a.contact_name || "",
					"id",
					{ sensitivity: "base" },
				);
				if (cmp !== 0) return cmp;
				return (b.invoice_date || "").localeCompare(
					a.invoice_date || "",
				);
			}
			if (sortMode === "nota_asc") {
				const cmp = (a.invoice_date || "").localeCompare(
					b.invoice_date || "",
				);
				if (cmp !== 0) return cmp;
				return (a.id || 0) - (b.id || 0);
			}
			if (sortMode === "nota_desc") {
				const cmp = (b.invoice_date || "").localeCompare(
					a.invoice_date || "",
				);
				if (cmp !== 0) return cmp;
				return (b.id || 0) - (a.id || 0);
			}
			if (sortMode === "date_asc") {
				const cmp = dateA.localeCompare(dateB);
				if (cmp !== 0) return cmp;
				return (a.id || 0) - (b.id || 0);
			}
			// default: date_desc (Tanggal Terbaru)
			const cmp = dateB.localeCompare(dateA);
			if (cmp !== 0) return cmp;
			return (b.id || 0) - (a.id || 0);
		});
	}

	// Form Saldo Harian
	let balanceDate = $state(getLocalTodayISO());
	let balanceAmount = $state("");
	let balanceNotes = $state("");

	// ================= PENGATURAN NOTIFIKASI & SUARA =================
	let soundEnabled = $state(true);
	let showNotifDropdown = $state(false);

	interface Toast {
		id: number;
		type: "success" | "warning" | "danger" | "info";
		title: string;
		message: string;
	}

	let toasts = $state<Toast[]>([]);
	let nextToastId = 1;

	function notify(
		type: "success" | "warning" | "danger" | "info",
		title: string,
		message: string,
	) {
		const id = nextToastId++;
		toasts = [...toasts, { id, type, title, message }];
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 5500);
	}

	function dismissToast(id: number) {
		toasts = toasts.filter((t) => t.id !== id);
	}

	function toggleSound() {
		soundEnabled = !soundEnabled;
		if (typeof window !== "undefined") {
			localStorage.setItem("finance_sound_enabled", String(soundEnabled));
		}
		if (soundEnabled) {
			sound.playAman();
			notify(
				"info",
				"Suara Diaktifkan 🔊",
				"Notifikasi suara sistem aktif.",
			);
		} else {
			notify(
				"info",
				"Suara Dinonaktifkan 🔇",
				"Notifikasi suara dalam mode senyap.",
			);
		}
	}

	// Filter tagihan yang segera jatuh tempo (H-5) dan lewat tempo (Merah)
	let overdueList = $derived(
		(data.activeDebts || []).filter((d: Debt) => d.urgency === "overdue"),
	);
	let h5List = $derived(
		(data.activeDebts || []).filter((d: Debt) => d.urgency === "h5"),
	);
	let totalUrgentCount = $derived(overdueList.length + h5List.length);

	onMount(() => {
		initTheme();
		const saved = localStorage.getItem("finance_sound_enabled");
		if (saved !== null) {
			soundEnabled = saved === "true";
		}
		// Cek peringatan jatuh tempo saat pertama buka halaman
		setTimeout(() => {
			if (overdueList.length > 0) {
				notify(
					"danger",
					`🚨 ${overdueList.length} Tagihan Lewat Jatuh Tempo!`,
					`Terdapat ${overdueList.length} tagihan ${data.currentCompany?.code} yang sudah menunggak melewati batas tempo. Harap segera lunasi.`,
				);
				if (soundEnabled) sound.playMerah();
			} else if (h5List.length > 0) {
				notify(
					"warning",
					`⚠️ ${h5List.length} Tagihan Mendekati Jatuh Tempo!`,
					`Terdapat ${h5List.length} tagihan ${data.currentCompany?.code} yang jatuh tempo dalam 5 hari ke depan (H-5).`,
				);
				if (soundEnabled) sound.playPerhatian();
			}
		}, 600);

		// Timer 1 detik untuk hitung mundur (detik/menit/jam/hari) batas kadaluarsa ACC & auto-batal ke OS Hutang Aktif
		const timer = setInterval(async () => {
			nowTick = Date.now();
			const pendingAll = data.allPendingDebts || data.pendingDebts || [];
			const hasExpired = pendingAll.some(
				(d: any) => d.pending_expires_ts && Number(d.pending_expires_ts) <= nowTick,
			);
			if (hasExpired && !isAutoExpiring) {
				isAutoExpiring = true;
				try {
					await invalidateAll();
					notify(
						"warning",
						"⏰ Pengajuan ACC Kadaluarsa!",
						"Tagihan yang melewati batas waktu tunggu ACC otomatis dibatalkan dan dikembalikan ke OS Hutang Aktif.",
					);
				} finally {
					setTimeout(() => {
						isAutoExpiring = false;
					}, 2000);
				}
			}
		}, 1000);

		return () => clearInterval(timer);
	});

	// Modal Detail Bon
	let showDetail = $state(false);
	let detailDebt = $state<any>(null);

	function openDetail(d: any) {
		detailDebt = d;
		showDetail = true;
	}

	function closeDetail() {
		showDetail = false;
		detailDebt = null;
	}

	// Histori pembayaran khusus untuk bon yang sedang dibuka
	let detailPayments = $derived(
		detailDebt
			? (data.payments || []).filter(
					(p: any) => p.debt_id === detailDebt.id,
				)
			: [],
	);

	function formatRupiahString(val: string) {
		const clean = val.replace(/\D/g, "");
		if (!clean) return "";
		return parseInt(clean, 10).toLocaleString("id-ID");
	}

	function handleAddAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		addAmountFormatted = formatRupiahString(target.value);
	}

	function handlePayAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		payAmountFormatted = formatRupiahString(target.value);
	}

	let directPaymentAmount = $state("");
	let directPaymentModalAmount = $state("");
	let showDirectModal = $state(false);

	function handleDirectAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		directPaymentAmount = formatRupiahString(target.value);
	}

	function handleDirectModalAmountInput(e: Event) {
		const target = e.target as HTMLInputElement;
		directPaymentModalAmount = formatRupiahString(target.value);
	}

	function openDirectModal() {
		directPaymentModalAmount = "";
		showDirectModal = true;
	}

	function closeDirectModal() {
		showDirectModal = false;
	}

	function handleBalanceInput(e: Event) {
		const target = e.target as HTMLInputElement;
		balanceAmount = formatRupiahString(target.value);
	}

	function openPay(d: Debt) {
		payDebt = d;
		payAmountFormatted = Math.round(d.remaining_amount).toLocaleString(
			"id-ID",
		);
		accExpireDays = 3;
		payTargetDate = isBoss ? getLocalTodayISO() : addDaysISO(getLocalTodayISO(), 3);
		showPay = true;
	}

	function closePay() {
		showPay = false;
		payDebt = null;
		payAmountFormatted = "";
	}
	function openAdd() {
		showAdd = true;
		hasDueDate = false;
		isNewSupplier = false;
		selectedContactId = "";
		addAmountFormatted = "";
		addContactType = "supplier";
	}
	function closeAdd() {
		showAdd = false;
	}

	function openEdit(d: any) {
		editDebtTarget = d;
		editContactName = d.contact_name || "";
		editContactType =
			d.contact_type === "non_vendor" ? "non_vendor" : "supplier";
		editInvoiceNo = d.invoice_no === "Tanpa Bon" ? "" : d.invoice_no || "";
		editInvoiceDate = d.invoice_date || "";
		editHasDue = !!d.due_date;
		editDueDate = d.due_date || "";
		editAmountFormatted = Math.round(d.amount || 0).toLocaleString("id-ID");
		editDescription = d.description || "";
		showEdit = true;
	}

	function closeEdit() {
		showEdit = false;
		editDebtTarget = null;
	}

	function rp(n: number) {
		return "Rp. " + Math.round(n).toLocaleString("id-ID");
	}

	function agingClass(bucket: string) {
		if (bucket === "0-30") return "badge-safe";
		if (bucket === "31-60") return "badge-h5";
		if (bucket === "61-90") return "badge-overdue";
		if (bucket === "91-120") return "badge-overdue";
		return "badge-overdue";
	}

	// Hitung jumlah yang mendesak untuk badge sidebar
	let urgentCount = $derived(
		(data.activeDebts || []).filter((d: Debt) => d.urgency !== "safe")
			.length,
	);

	// Total yang sudah dibayar
	let totalPaidAmount = $derived(
		(data.paidDebts || []).reduce(
			(acc: number, d: any) => acc + (d.paid_amount || d.amount || 0),
			0,
		),
	);

	// ================= FILTER BULAN / TAHUN / TANGGAL & 2 PT MULTI-COMPANY =================
	let timeFilterMode = $state<"all" | "month" | "range" | "date">("month");
	let activePreset = $state<
		"this_month" | "last_month" | "this_year" | "today" | "all" | "custom"
	>("this_month");
	let showCustomPicker = $state<boolean>(false);

	const todayObj = new Date();
	let currentCalMonth = todayObj.getMonth() + 1;
	let currentCalYear = todayObj.getFullYear();
	let todayISODate = getLocalTodayISO();

	let filterMonth = $state<number | "all">(currentCalMonth);
	let filterYear = $state<number | "all">(currentCalYear);
	let filterStartDate = $state<string>("");
	let filterEndDate = $state<string>("");
	let filterSpecificDate = $state<string>("");

	// Active Company Code dari navbar
	let currentCompanyCode = $derived(data.currentCompany?.code || "ART");

	const monthList = [
		{ val: 1, name: "Januari" },
		{ val: 2, name: "Februari" },
		{ val: 3, name: "Maret" },
		{ val: 4, name: "April" },
		{ val: 5, name: "Mei" },
		{ val: 6, name: "Juni" },
		{ val: 7, name: "Juli" },
		{ val: 8, name: "Agustus" },
		{ val: 9, name: "September" },
		{ val: 10, name: "Oktober" },
		{ val: 11, name: "November" },
		{ val: 12, name: "Desember" },
	];

	let yearList = $derived.by(() => {
		const baseYear = currentCalYear;
		const setY = new Set<number>([
			baseYear - 2,
			baseYear - 1,
			baseYear,
			baseYear + 1,
		]);
		for (const d of data.allActiveDebts || data.activeDebts || []) {
			if (d.invoice_date) {
				const y = parseInt(d.invoice_date.split("-")[0], 10);
				if (!isNaN(y)) setY.add(y);
			}
		}
		for (const d of data.allPaidDebts || data.paidDebts || []) {
			if (d.invoice_date) {
				const y = parseInt(d.invoice_date.split("-")[0], 10);
				if (!isNaN(y)) setY.add(y);
			}
		}
		return Array.from(setY).sort((a, b) => b - a);
	});

	function applyPreset(
		preset:
			| "all"
			| "this_month"
			| "last_month"
			| "this_year"
			| "today"
			| "custom",
	) {
		activePreset = preset;
		if (preset === "all") {
			timeFilterMode = "all";
			filterMonth = "all";
			filterYear = "all";
			filterStartDate = "";
			filterEndDate = "";
			filterSpecificDate = "";
			showCustomPicker = false;
		} else if (preset === "this_month") {
			timeFilterMode = "month";
			filterMonth = currentCalMonth;
			filterYear = currentCalYear;
			showCustomPicker = false;
		} else if (preset === "last_month") {
			timeFilterMode = "month";
			let lm = currentCalMonth - 1;
			let ly = currentCalYear;
			if (lm < 1) {
				lm = 12;
				ly -= 1;
			}
			filterMonth = lm;
			filterYear = ly;
			showCustomPicker = false;
		} else if (preset === "this_year") {
			timeFilterMode = "month";
			filterMonth = "all";
			filterYear = currentCalYear;
			showCustomPicker = false;
		} else if (preset === "today") {
			timeFilterMode = "date";
			filterSpecificDate = todayISODate;
			exportPaidDate = todayISODate;
			exportPaidMode = "daily";
			showCustomPicker = false;
		} else if (preset === "custom") {
			showCustomPicker = !showCustomPicker;
		}
	}

	function matchesDateFilter(dateStr?: string | null): boolean {
		if (timeFilterMode === "all") return true;
		if (!dateStr) return false;
		const parts = dateStr.split("-");
		if (parts.length < 3) return true;
		const y = parseInt(parts[0], 10);
		const m = parseInt(parts[1], 10);

		if (timeFilterMode === "month") {
			if (filterYear !== "all" && y !== filterYear) return false;
			if (filterMonth !== "all" && m !== filterMonth) return false;
			return true;
		}
		if (timeFilterMode === "date") {
			if (!filterSpecificDate) return true;
			return dateStr === filterSpecificDate;
		}
		if (timeFilterMode === "range") {
			if (filterStartDate && dateStr < filterStartDate) return false;
			if (filterEndDate && dateStr > filterEndDate) return false;
			return true;
		}
		return true;
	}

	let activePeriodLabel = $derived.by(() => {
		if (timeFilterMode === "all") return "Semua Waktu (Seluruh Periode)";
		if (timeFilterMode === "month") {
			const mName =
				filterMonth === "all"
					? "Semua Bulan"
					: monthList.find((x) => x.val === filterMonth)?.name;
			const yName = filterYear === "all" ? "Semua Tahun" : filterYear;
			return `${mName} ${yName}`;
		}
		if (timeFilterMode === "date") {
			return filterSpecificDate
				? `Tanggal: ${filterSpecificDate}`
				: "Semua Tanggal";
		}
		if (timeFilterMode === "range") {
			if (filterStartDate && filterEndDate)
				return `${filterStartDate} s/d ${filterEndDate}`;
			if (filterStartDate) return `Mulai ${filterStartDate}`;
			if (filterEndDate) return `Sampai ${filterEndDate}`;
			return "Rentang Tanggal";
		}
		return "Semua Waktu";
	});

	// ---- 1. Menu OS Hutang Aktif (Khusus PT Aktif dari Navbar) ----
	let sourceAllActiveDebts = $derived<Debt[]>(
		(data.allActiveDebts || data.activeDebts || [])
			.map((d: any) => ({
				...d,
				company_code:
					d.company_code ||
					data.companies?.find((c: any) => c.id === d.company_id)
						?.code ||
					"ART",
			}))
			.filter((d: any) => d.company_code === currentCompanyCode),
	);

	let debtsTimeFiltered = $derived(
		sourceAllActiveDebts.filter((d: Debt) =>
			matchesDateFilter(d.invoice_date),
		),
	);

	let filteredDebts = $derived(
		sortDebtItems(
			debtsTimeFiltered.filter((d: Debt) => {
				if (agingFilter !== "all" && d.aging_bucket !== agingFilter)
					return false;
				if (search.trim()) {
					const q = search.toLowerCase();
					return (
						d.contact_name.toLowerCase().includes(q) ||
						d.description.toLowerCase().includes(q) ||
						(d.invoice_no || "").toLowerCase().includes(q)
					);
				}
				return true;
			}) || [],
			debtSortBy,
		),
	);

	let summaryDebtsCurrent = $derived.by(() => {
		const totalRemaining = debtsTimeFiltered.reduce(
			(sum: number, d: Debt) => sum + d.remaining_amount,
			0,
		);
		return { count: debtsTimeFiltered.length, totalRemaining };
	});

	let activeAgingBuckets = $derived.by(() => {
		const b = {
			b0_30: 0,
			b31_60: 0,
			b61_90: 0,
			b91_120: 0,
			b_over120: 0,
			total: 0,
		};
		for (const d of debtsTimeFiltered) {
			if (d.aging_bucket === "0-30") b.b0_30 += d.remaining_amount;
			else if (d.aging_bucket === "31-60") b.b31_60 += d.remaining_amount;
			else if (d.aging_bucket === "61-90") b.b61_90 += d.remaining_amount;
			else if (d.aging_bucket === "91-120")
				b.b91_120 += d.remaining_amount;
			else b.b_over120 += d.remaining_amount;
			b.total += d.remaining_amount;
		}
		return b;
	});

	// ---- 2. Menu Menunggu ACC Atasan (Khusus PT Aktif dari Navbar) ----
	let sourceAllPendingDebts = $derived<Debt[]>(
		(data.allPendingDebts || data.pendingDebts || [])
			.map((d: any) => ({
				...d,
				company_code:
					d.company_code ||
					data.companies?.find((c: any) => c.id === d.company_id)
						?.code ||
					"ART",
			}))
			.filter((d: any) => d.company_code === currentCompanyCode),
	);

	let pendingTimeFiltered = $derived(
		sourceAllPendingDebts.filter((d: Debt) =>
			matchesDateFilter(d.pending_payment_date || d.invoice_date),
		),
	);

	let summaryPendingCurrent = $derived.by(() => {
		const totalPending = pendingTimeFiltered.reduce(
			(sum: number, d: Debt) =>
				sum + (d.pending_amount || d.remaining_amount),
			0,
		);
		return { count: pendingTimeFiltered.length, totalPending };
	});

	let pendingAgingBuckets = $derived.by(() => {
		const b = {
			b0_30: 0,
			b31_60: 0,
			b61_90: 0,
			b91_120: 0,
			b_over120: 0,
			total: 0,
		};
		for (const d of pendingTimeFiltered) {
			const nom = d.pending_amount || d.remaining_amount;
			if (d.aging_bucket === "0-30") b.b0_30 += nom;
			else if (d.aging_bucket === "31-60") b.b31_60 += nom;
			else if (d.aging_bucket === "61-90") b.b61_90 += nom;
			else if (d.aging_bucket === "91-120") b.b91_120 += nom;
			else b.b_over120 += nom;
			b.total += nom;
		}
		return b;
	});

	let filteredPendingDebts = $derived(
		sortDebtItems(
			pendingTimeFiltered.filter((d: Debt) => {
				if (pendingAgingFilter !== "all" && d.aging_bucket !== pendingAgingFilter)
					return false;
				if (pendingSearch.trim()) {
					const q = pendingSearch.toLowerCase();
					return (
						d.contact_name.toLowerCase().includes(q) ||
						d.description.toLowerCase().includes(q) ||
						(d.invoice_no || "").toLowerCase().includes(q) ||
						(d.pending_by || "").toLowerCase().includes(q)
					);
				}
				return true;
			}),
			pendingSortBy,
		),
	);

	// Helper Persetujuan & WhatsApp Reminder ke Atasan (Pak Danny)
	function openRejectModal(d: Debt) {
		rejectTargetDebt = d;
		rejectReason = "";
		showRejectModal = true;
	}

	function closeRejectModal() {
		showRejectModal = false;
		rejectTargetDebt = null;
		rejectReason = "";
	}

	function openApproveModal(d: Debt, viaWa: boolean = false) {
		approveTargetDebt = d;
		isWaApproval = viaWa;
		waApproverName = "Pak Danny / Pak Carmen";
		approvePaymentDate = getLocalTodayISO();
		showApproveModal = true;
	}

	function closeApproveModal() {
		showApproveModal = false;
		approveTargetDebt = null;
		isWaApproval = false;
	}

	function sendWhatsAppReminder(d: Debt) {
		const compName =
			d.company_name ||
			data.currentCompany?.name ||
			"PT Anugerah Rezeki Teknindo";
		const compCode = d.company_code || data.currentCompany?.code || "ART";
		const nominal = rp(d.pending_amount || d.remaining_amount);
		const tgl = d.pending_payment_date || todayISODate;
		const pengaju =
			d.pending_by || data.currentUser?.name || "Petugas Keuangan";
		const catatan = d.pending_notes
			? `\n- *Catatan/Pesan*: ${d.pending_notes}`
			: "";

		const msg = `*PENGINGAT PERSETUJUAN (ACC) PEMBAYARAN* 🔔
Halo Pak, mohon persetujuan (ACC) pembayaran tagihan berikut:
- *Perusahaan*: ${compCode} (${compName})
- *Supplier / Toko*: ${d.contact_name}
- *No. Bon / Faktur*: ${d.invoice_no || "-"}
- *Nominal Pengajuan*: ${nominal}
- *Rencana Tgl Bayar*: ${tgl}
- *Diajukan Oleh*: ${pengaju}${catatan}

Mohon dapat di-ACC melalui program Rekapan Keuangan. Terima kasih!`;

		window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
		notify(
			"info",
			"Notifikasi WhatsApp Dibuka! 📱",
			"Pesan pengingat untuk Pak Danny/Pak Carmen telah disiapkan.",
		);
	}

	function sendAllPendingWhatsAppReminder() {
		const list =
			filteredPendingDebts.length > 0
				? filteredPendingDebts
				: data.pendingDebts || [];
		if (list.length === 0) {
			notify(
				"info",
				"Tidak Ada Antrean",
				"Tidak ada tagihan yang sedang menunggu ACC saat ini.",
			);
			return;
		}

		const compCode = data.currentCompany?.code || "ART";
		const totalNominal = list.reduce(
			(sum: number, d: Debt) =>
				sum + (d.pending_amount || d.remaining_amount),
			0,
		);
		const textItems = list
			.map((d: Debt, i: number) => {
				const nom = rp(d.pending_amount || d.remaining_amount);
				return `${i + 1}. *${d.contact_name}*: ${nom} (${d.description})`;
			})
			.join("\n");

		const msg = `*REKAPAN ANTREAN MENUNGGU ACC ATASAN* 🔔
Halo Pak Danny/Pak Carmen, terdapat *${list.length} tagihan* yang sedang menunggu persetujuan (ACC) pembayaran Anda dengan total nominal *${rp(totalNominal)}* (${compCode}):

${textItems}

Mohon dapat segera diperiksa dan di-ACC di program Rekapan Keuangan. Terima kasih!`;

		window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
		notify(
			"info",
			"Notifikasi WhatsApp Siap Dikirim! 📱",
			"Pesan ringkasan antrean telah dibuat untuk Pak Danny/Pak Carmen.",
		);
	}

	// ---- 3. Menu Sudah Dibayar / Lunas (Khusus PT Aktif dari Navbar) ----
	let sourceAllPaidDebts = $derived<any[]>(
		(data.allPaidDebts || data.paidDebts || [])
			.map((d: any) => ({
				...d,
				company_code:
					d.company_code ||
					data.companies?.find((c: any) => c.id === d.company_id)
						?.code ||
					"ART",
			}))
			.filter((d: any) => d.company_code === currentCompanyCode),
	);

	let paidTimeFiltered = $derived(
		sourceAllPaidDebts.filter((d: any) =>
			matchesDateFilter(d.payment_date || d.invoice_date),
		),
	);

	let summaryPaidCurrent = $derived.by(() => {
		const totalPaid = paidTimeFiltered.reduce(
			(sum: number, d: any) => sum + (d.paid_amount || d.amount || 0),
			0,
		);
		return { count: paidTimeFiltered.length, totalPaid };
	});

	let filteredPaidDebts = $derived(
		sortDebtItems(
			paidTimeFiltered.filter((d: any) => {
				if (paidSearch.trim()) {
					const q = paidSearch.toLowerCase();
					return (
						(d.contact_name || "").toLowerCase().includes(q) ||
						(d.description || "").toLowerCase().includes(q) ||
						(d.invoice_no || "").toLowerCase().includes(q)
					);
				}
				return true;
			}),
			paidSortBy,
			true,
		),
	);

	let exportPembayaranQuery = $derived.by(() => {
		const pt = data.currentCompany?.code || "ART";
		if (exportPaidMode === "daily" && exportPaidDate) {
			return `pt=${pt}&date=${exportPaidDate}`;
		}
		if (timeFilterMode === "date" && filterSpecificDate) {
			return `pt=${pt}&date=${filterSpecificDate}`;
		}
		if (timeFilterMode === "range") {
			return `pt=${pt}&start=${filterStartDate}&end=${filterEndDate}`;
		}
		if (timeFilterMode === "month") {
			return `pt=${pt}&month=${filterMonth}&year=${filterYear}`;
		}
		return `pt=${pt}`;
	});

	let summaryFilteredPaid = $derived.by(() => {
		const total = filteredPaidDebts.reduce(
			(sum: number, d: any) => sum + (d.paid_amount || d.amount || 0),
			0,
		);
		return { count: filteredPaidDebts.length, total };
	});

	// ---- 4. Menu Saldo Harian (Khusus PT Aktif dari Navbar) ----
	let sourceAllDailyBalances = $derived<any[]>(
		(data.allDailyBalances || data.dailyBalances || [])
			.map((b: any) => ({
				...b,
				company_code:
					b.company_code ||
					data.companies?.find((c: any) => c.id === b.company_id)
						?.code ||
					"ART",
			}))
			.filter((b: any) => b.company_code === currentCompanyCode),
	);

	let balancesTimeFiltered = $derived(
		sourceAllDailyBalances.filter((b: any) =>
			matchesDateFilter(b.balance_date),
		),
	);

	let summaryBalanceCurrent = $derived.by(() => {
		const latestBal =
			balancesTimeFiltered.length > 0
				? balancesTimeFiltered[0].balance_amount
				: null;
		return { count: balancesTimeFiltered.length, latestBalance: latestBal };
	});

	let filteredDailyBalances = $derived(balancesTimeFiltered);
</script>

<div class="layout">
	<!-- SIDEBAR -->
	<aside class="sidebar">
		<div class="sidebar-logo">
			<div class="logo-mark">
				<CatLogoIcon size={42} />
				<div>
					<div class="logo-text">OS Hutang</div>
					<div class="logo-sub">Sistem Rekapan Keuangan</div>
				</div>
			</div>

			<!-- PT Switcher (ART / KNM) -->
			<div class="pt-switcher">
				{#each data.companies || [] as pt}
					<a
						href="?pt={pt.code}"
						class="pt-btn"
						class:active={data.currentCompany?.code === pt.code}
					>
						{pt.code}
					</a>
				{/each}
			</div>
		</div>

		<nav class="sidebar-nav">
			<div class="nav-section-label">Manajemen Hutang</div>

			<button
				class="nav-item"
				class:active={page === "debts"}
				onclick={() => (page = "debts")}
			>
				<div class="nav-item-left">
					<span class="nav-item-icon">📋</span>
					<span>OS Hutang Aktif</span>
				</div>
				<span class="nav-count" class:alert={urgentCount > 0}>
					{data.activeDebts?.length || 0}
				</span>
			</button>

			<button
				class="nav-item"
				class:active={page === "pending_approval"}
				onclick={() => (page = "pending_approval")}
			>
				<div class="nav-item-left">
					<span class="nav-item-icon">⏳</span>
					<span>Menunggu ACC</span>
				</div>
				{#if (data.pendingDebts?.length || 0) > 0}
					<span
						class="nav-count"
						style="background:#f59e0b; color:#ffffff; font-weight:700; box-shadow:0 0 8px rgba(245,158,11,0.5);"
					>
						{data.pendingDebts?.length || 0}
					</span>
				{:else}
					<span class="nav-count">0</span>
				{/if}
			</button>

			<button
				class="nav-item"
				class:active={page === "history"}
				onclick={() => (page = "history")}
			>
				<div class="nav-item-left">
					<span class="nav-item-icon">✅</span>
					<span>Sudah Dibayar</span>
				</div>
				<span class="nav-count">{data.paidDebts?.length || 0}</span>
			</button>

			<div class="nav-section-label" style="margin-top:1.25rem;">
				Laporan Saldo Harian
			</div>

			<!-- Tampil satu-satu sesuai PT yang sedang aktif tanpa icon badge di ujung -->
			{#if data.currentCompany?.code === "ART"}
				<button
					class="nav-item"
					class:active={page === "balance"}
					onclick={() => (page = "balance")}
				>
					<div class="nav-item-left">
						<span class="nav-item-icon">💰</span>
						<span>Saldo ART</span>
					</div>
				</button>
			{:else}
				<button
					class="nav-item"
					class:active={page === "balance"}
					onclick={() => (page = "balance")}
				>
					<div class="nav-item-left">
						<span class="nav-item-icon">💰</span>
						<span>Saldo KNM</span>
					</div>
				</button>
			{/if}
		</nav>

		<div class="sidebar-footer">
			<div
				style="padding-bottom:0.4rem; border-bottom:1px solid #1e293b; margin-bottom:0.5rem;"
			>
				<div
					style="font-size:0.7rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; display:flex; align-items:center; justify-content:space-between;"
				>
					<span
						>{isBoss
							? "Atasan / Direksi:"
							: "Petugas Keuangan:"}</span
					>
					{#if isBoss}
						<span
							style="font-size:0.65rem; font-weight:700; background:#6366f1; color:#fff; padding:0.05rem 0.35rem; border-radius:4px;"
							>ACC</span
						>
					{/if}
				</div>
				<div
					style="font-weight:700; color:#f8fafc; font-size:0.82rem; margin-top:0.1rem;"
				>
					{data.currentUser?.name || "Admin Rekapan"}
				</div>
				<div
					style="font-size:0.7rem; color:{isBoss
						? '#818cf8'
						: '#f472b6'};"
				>
					@{data.currentUser?.username || "admin_rekapan"}
				</div>
			</div>
			<div
				style="font-size:0.72rem; color:#64748b; margin-bottom:0.6rem;"
			>
				Perusahaan: <strong style="color:#cbd5e1;"
					>{data.currentCompany?.code}</strong
				>
			</div>
			<a
				href="/api/auth/logout"
				class="btn-logout"
				title="Keluar dari akun"
			>
				<span>🚪</span>
				<span>Keluar / Logout</span>
			</a>
		</div>
	</aside>

	<!-- KONTEN KANAN -->
	<div class="main">
		<!-- Top Bar -->
		<header class="topbar">
			<div>
				{#if page === "debts"}
					<div class="page-title">OS Hutang Aktif</div>
					<div class="page-desc">
						Semua tagihan yang belum lunas — {data.currentCompany
							?.name}
					</div>
				{:else if page === "pending_approval"}
					<div class="page-title">
						Menunggu Persetujuan Atasan (ACC)
					</div>
					<div class="page-desc">
						Daftar tagihan yang diajukan untuk dibayar dan menunggu
						persetujuan dari Pak Danny — {data.currentCompany?.name}
					</div>
				{:else if page === "history"}
					<div class="page-title">Sudah Dibayar / Lunas</div>
					<div class="page-desc">
						Histori tagihan yang sudah dilunasi — data tidak
						dihapus, tetap tersimpan
					</div>
				{:else if page === "balance"}
					<div class="page-title">
						Laporan Saldo Harian — {data.currentCompany?.code}
					</div>
					<div class="page-desc">
						Pencatatan sisa saldo aktual per hari untuk {data
							.currentCompany?.name}
					</div>
				{/if}
			</div>

			<div style="display:flex; align-items:center; gap:0.65rem;">
				<!-- Tombol Theme Mode (Terang / Gelap) -->
				<button
					type="button"
					class="btn-theme-nav"
					onclick={toggleTheme}
					title="Ganti Mode Tampilan (Terang / Gelap)"
				>
					<span>{$theme === "dark" ? "☀️" : "🌙"}</span>
					<span>{$theme === "dark" ? "Terang" : "Gelap"}</span>
				</button>

				<!-- Tombol Saklar Suara Notifikasi -->
				<button
					type="button"
					class="btn-sound-toggle"
					class:muted={!soundEnabled}
					onclick={toggleSound}
					title="Klik untuk menyalakan/mematikan suara notifikasi (Aman, Perhatian, Merah)"
				>
					<span>{soundEnabled ? "🔊" : "🔇"}</span>
					<span>{soundEnabled ? "Suara ON" : "Suara OFF"}</span>
				</button>

				<!-- Lonceng Notifikasi Peringatan Jatuh Tempo & Antrean ACC -->
				<div class="notif-bell-container">
					<button
						type="button"
						class="btn-bell"
						class:has-urgent={totalUrgentCount > 0 ||
							(data.pendingDebts?.length || 0) > 0}
						onclick={() => (showNotifDropdown = !showNotifDropdown)}
						title="Pusat Notifikasi: Antrean ACC & Jatuh Tempo"
					>
						<span>🔔</span>
						{#if (data.pendingDebts?.length || 0) > 0 || totalUrgentCount > 0}
							<span
								class="bell-badge"
								style={(data.pendingDebts?.length || 0) > 0
									? "background:#f59e0b; color:#ffffff;"
									: ""}
								class:danger={overdueList.length > 0}
								class:warning={overdueList.length === 0 &&
									h5List.length > 0}
							>
								{(data.pendingDebts?.length || 0) +
									totalUrgentCount}
							</span>
						{/if}
					</button>

					<!-- DROPDOWN NOTIFIKASI -->
					{#if showNotifDropdown}
						<div class="notif-dropdown">
							<div class="notif-drop-head">
								<div
									style="font-weight:700; font-size:0.9rem; color:#0f172a;"
								>
									🔔 Pusat Notifikasi ({data.currentCompany
										?.code})
								</div>
								<button
									type="button"
									class="notif-close-btn"
									onclick={() => (showNotifDropdown = false)}
									>✕</button
								>
							</div>

							<!-- TES NADA SUARA -->
							<div class="notif-sound-test-box">
								<div class="notif-sound-label">
									Tes Notasi Suara:
								</div>
								<div class="notif-sound-btns">
									<button
										type="button"
										class="btn-test-sound sound-green"
										onclick={() => sound.playAman()}
										title="Notasi nada ceria saat bon disimpan atau lunas"
									>
										🟢 Aman
									</button>
									<button
										type="button"
										class="btn-test-sound sound-yellow"
										onclick={() => sound.playPerhatian()}
										title="Notasi peringatan halus saat H-5 mendekati tempo"
									>
										🟡 Perhatian
									</button>
									<button
										type="button"
										class="btn-test-sound sound-red"
										onclick={() => sound.playMerah()}
										title="Notasi peringatan tegas saat tagihan sudah merah / telat"
									>
										🔴 Merah
									</button>
								</div>
							</div>

							<div class="notif-drop-body">
								<!-- SEKSI ANTREAN MENUNGGU ACC ATASAN -->
								{#if (data.pendingDebts?.length || 0) > 0}
									<div
										class="notif-section-title"
										style="background:#fffbeb; color:#b45309; border-left:3px solid #f59e0b; padding:0.4rem 0.6rem; border-radius:4px; margin-bottom:0.6rem; display:flex; justify-content:space-between; align-items:center;"
									>
										<span
											>⏳ MENUNGGU ACC ATASAN ({data
												.pendingDebts?.length ||
												0})</span
										>
										<button
											type="button"
											style="background:none; border:none; color:#2563eb; font-size:0.72rem; cursor:pointer; text-decoration:underline;"
											onclick={() => {
												page = "pending_approval";
												showNotifDropdown = false;
											}}
										>
											Lihat Semua ➔
										</button>
									</div>

									{#each (data.pendingDebts || []).slice(0, 5) as d}
										<div
											class="notif-item"
											style="border-left:3px solid #f59e0b; background:#fffdf5; padding:0.6rem 0.75rem; border-radius:8px; margin-bottom:0.5rem; box-shadow:0 1px 3px rgba(0,0,0,0.03);"
										>
											<div
												class="notif-item-top"
												style="display:flex; justify-content:space-between; align-items:center;"
											>
												<strong
													style="color:#0f172a; font-size:0.85rem;"
													>{d.contact_name}</strong
												>
												<span
													style="font-size:0.7rem; background:#fef3c7; color:#92400e; padding:0.15rem 0.45rem; border-radius:4px; font-weight:700;"
												>
													Menunggu ACC
												</span>
											</div>
											<div
												class="notif-item-desc"
												style="font-size:0.75rem; color:#64748b; margin:0.25rem 0;"
											>
												{d.description} • Diajukan: {d.pending_by ||
													"Petugas"}
											</div>
											<div
												class="notif-item-foot"
												style="display:flex; justify-content:space-between; align-items:center; margin-top:0.4rem;"
											>
												<span
													class="notif-amount"
													style="font-weight:700; color:#b45309; font-size:0.88rem;"
												>
													{rp(
														d.pending_amount ||
															d.remaining_amount,
													)}
												</span>
												<div
													style="display:flex; gap:0.35rem;"
												>
													{#if isBoss}
														<button
															type="button"
															class="btn-pay-quick"
															style="background:#10b981; font-size:0.72rem; padding:0.25rem 0.55rem;"
															onclick={() => {
																showNotifDropdown = false;
																openApproveModal(
																	d,
																);
															}}
														>
															✅ ACC
														</button>
													{:else}
														<button
															type="button"
															class="btn-pay-quick"
															style="background:#059669; font-size:0.72rem; padding:0.25rem 0.55rem;"
															onclick={() => {
																showNotifDropdown = false;
																openApproveModal(
																	d,
																	true,
																);
															}}
															title="Langsung ACC jika sudah dikonfirmasi Bos lewat WhatsApp"
														>
															✅ ACC WA
														</button>
														<button
															type="button"
															class="btn-pay-quick"
															style="background:#25d366; font-size:0.72rem; padding:0.25rem 0.55rem;"
															onclick={() =>
																sendWhatsAppReminder(
																	d,
																)}
															title="Kirim pengingat WhatsApp ke Pak Danny/Pak Carmen"
														>
															📱 WA Bos
														</button>
													{/if}
												</div>
											</div>
										</div>
									{/each}

									<div
										style="margin-bottom:0.85rem; padding-bottom:0.6rem; border-bottom:1px dashed #e2e8f0; display:flex; gap:0.4rem;"
									>
										<button
											type="button"
											style="flex:1; background:#25d366; color:#fff; border:none; border-radius:6px; padding:0.45rem; font-size:0.75rem; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:0.3rem;"
											onclick={sendAllPendingWhatsAppReminder}
										>
											<span>📱</span>
											<span
												>Kirim Pesan Whatsapp Ke Pak
												Danny/Pak Carmen</span
											>
										</button>
									</div>
								{/if}
								{#if overdueList.length > 0}
									<div class="notif-section-title danger">
										🚨 LEWAT JATUH TEMPO ({overdueList.length})
									</div>
									{#each overdueList as d}
										<div class="notif-item overdue">
											<div class="notif-item-top">
												<strong>{d.contact_name}</strong
												>
												<span
													class="notif-days-tag danger"
													>Telat {Math.abs(
														d.days_until_due,
													)} hari</span
												>
											</div>
											<div class="notif-item-desc">
												{d.description}
											</div>
											<div class="notif-item-foot">
												<span class="notif-amount"
													>{rp(
														d.remaining_amount,
													)}</span
												>
												<button
													type="button"
													class="btn-pay-quick"
													onclick={() => {
														showNotifDropdown = false;
														openPay(d);
													}}
												>
													Bayar Sekarang 💳
												</button>
											</div>
										</div>
									{/each}
								{/if}

								{#if h5List.length > 0}
									<div
										class="notif-section-title warning"
										style="margin-top:0.75rem;"
									>
										⚠️ MENDEKATI JATUH TEMPO H-5 ({h5List.length})
									</div>
									{#each h5List as d}
										<div class="notif-item h5">
											<div class="notif-item-top">
												<strong>{d.contact_name}</strong
												>
												<span
													class="notif-days-tag warning"
													>H-{d.days_until_due} hari lagi</span
												>
											</div>
											<div class="notif-item-desc">
												{d.description}
											</div>
											<div class="notif-item-foot">
												<span class="notif-amount"
													>{rp(
														d.remaining_amount,
													)}</span
												>
												<button
													type="button"
													class="btn-pay-quick"
													onclick={() => {
														showNotifDropdown = false;
														openPay(d);
													}}
												>
													Bayar 💳
												</button>
											</div>
										</div>
									{/each}
								{/if}

								{#if totalUrgentCount === 0}
									<div class="notif-empty">
										<div
											style="font-size:1.8rem; margin-bottom:0.25rem;"
										>
											✅
										</div>
										<div
											style="font-weight:700; color:#166534; font-size:0.9rem;"
										>
											Semua Tagihan Aman!
										</div>
										<div
											style="font-size:0.78rem; color:#64748b; margin-top:0.2rem;"
										>
											Tidak ada bon yang lewat batas tempo
											maupun yang mendekati H-5 di {data
												.currentCompany?.code}.
										</div>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>

				{#if page === "debts"}
					<button
						type="button"
						class="btn-primary"
						style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35); margin-right: 0.25rem;"
						onclick={openDirectModal}
						title="Catat pengeluaran langsung / kasbon / belanja tanpa bon yang langsung bayar"
					>
						💸 + Bayar Langsung (Tanpa Bon)
					</button>
					<button class="btn-primary" onclick={openAdd}>
						+ Catat Bon / Tagihan Baru
					</button>
				{:else if page === "pending_approval"}
					<button
						type="button"
						class="btn-primary"
						style="background: linear-gradient(135deg, #25d366 0%, #128c7e 100%); box-shadow: 0 2px 10px rgba(37, 211, 102, 0.35);"
						onclick={sendAllPendingWhatsAppReminder}
						title="Kirim notifikasi WhatsApp ringkasan daftar antrean ACC ke Pak Danny/Pak Carmen"
					>
						📱 Kirim Notifikasi WA ke Pak Danny/Pak Carmen
					</button>
				{:else if page === "history"}
					<button
						type="button"
						class="btn-primary"
						style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);"
						onclick={() => {
							const el = document.getElementById(
								"form-pengeluaran-langsung",
							);
							if (el) {
								el.scrollIntoView({ behavior: "smooth" });
								const input = document.getElementById(
									"input-direct-recipient",
								);
								if (input) input.focus();
							} else {
								openDirectModal();
							}
						}}
						title="Catat pengeluaran kas langsung / belanja tanpa bon"
					>
						💸 + Pengeluaran Langsung (Tanpa Bon)
					</button>
				{:else if page === "balance"}
					<button
						class="btn-primary"
						onclick={() => {
							const el = document.getElementById("form-saldo");
							if (el) {
								el.scrollIntoView({ behavior: "smooth" });
								const input =
									document.getElementById(
										"input-saldo-amount",
									);
								if (input) input.focus();
							}
						}}
					>
						✍️ + Input / Perbarui Sisa Saldo
					</button>
				{/if}
			</div>
		</header>

		<div class="content">
			<!-- Flash Notification -->
			{#if form?.success}
				<div class="flash flash-success">✅ Berhasil disimpan!</div>
			{:else if form?.error}
				<div class="flash flash-error">⚠️ {form.error}</div>
			{/if}

			<!-- ================== BAR FILTER PERIODE MODERN (5 TOMBOL UTAMA) ================== -->
			<div class="period-filter-card modern-filter-box">
				<div class="modern-filter-header">
					<div class="filter-header-left">
						<span class="modern-filter-icon">🗓️</span>
						<div class="modern-filter-meta">
							<div class="filter-main-title">
								Filter Periode &amp; Tanggal Transaksi
							</div>
							<div class="filter-status-row">
								<span class="period-status-label"
									>Periode Terpilih:</span
								>
								<span class="badge-active-period"
									>{activePeriodLabel}</span
								>
								<span class="meta-separator">&bull;</span>
								<span
									class="badge-pt-pill {currentCompanyCode ===
									'ART'
										? 'art'
										: 'knm'}"
								>
									PT {data.currentCompany?.code} ({data
										.currentCompany?.name})
								</span>
							</div>
						</div>
					</div>

					<!-- Tepat 5 Tombol Filter Utama Modern & Rapi (+ 1 Tombol Kustom Minimalis) -->
					<div class="filter-buttons-cluster">
						<button
							type="button"
							class="modern-filter-btn"
							class:active={activePreset === "this_month" &&
								!showCustomPicker}
							onclick={() => applyPreset("this_month")}
						>
							<span class="btn-emoji">📅</span>
							<span>Bulan Ini</span>
						</button>
						<button
							type="button"
							class="modern-filter-btn"
							class:active={activePreset === "last_month" &&
								!showCustomPicker}
							onclick={() => applyPreset("last_month")}
						>
							<span class="btn-emoji">⏪</span>
							<span>Bulan Lalu</span>
						</button>
						<button
							type="button"
							class="modern-filter-btn"
							class:active={activePreset === "this_year" &&
								!showCustomPicker}
							onclick={() => applyPreset("this_year")}
						>
							<span class="btn-emoji">🗓️</span>
							<span>Tahun Ini</span>
						</button>
						<button
							type="button"
							class="modern-filter-btn"
							class:active={activePreset === "today" &&
								!showCustomPicker}
							onclick={() => applyPreset("today")}
						>
							<span class="btn-emoji">📌</span>
							<span>Hari Ini</span>
						</button>
						<button
							type="button"
							class="modern-filter-btn btn-all-filter"
							class:active={activePreset === "all" &&
								!showCustomPicker}
							onclick={() => applyPreset("all")}
						>
							<span class="btn-emoji">🌐</span>
							<span>Semua</span>
						</button>
						<button
							type="button"
							class="modern-filter-btn btn-custom-filter"
							class:active={showCustomPicker}
							onclick={() => applyPreset("custom")}
							title="Pilih rentang tanggal atau bulan tertentu"
						>
							<span class="btn-emoji">⚙️</span>
							<span>Kustom</span>
							<span class="caret-indicator"
								>{showCustomPicker ? "▲" : "▼"}</span
							>
						</button>
					</div>
				</div>

				<!-- Panel Input Kustom: Hanya Muncul Ketika Tombol "Kustom" Diklik -->
				{#if showCustomPicker}
					<div class="custom-filter-dropdown">
						<div class="custom-tab-strip">
							<button
								type="button"
								class="custom-tab-pill"
								class:active={timeFilterMode === "month"}
								onclick={() => (timeFilterMode = "month")}
							>
								📅 Bulan &amp; Tahun
							</button>
							<button
								type="button"
								class="custom-tab-pill"
								class:active={timeFilterMode === "range"}
								onclick={() => (timeFilterMode = "range")}
							>
								📆 Rentang Tanggal
							</button>
							<button
								type="button"
								class="custom-tab-pill"
								class:active={timeFilterMode === "date"}
								onclick={() => (timeFilterMode = "date")}
							>
								📌 Tanggal Tertentu
							</button>
						</div>

						<div class="custom-controls-body">
							{#if timeFilterMode === "month"}
								<div class="custom-field-group">
									<label for="filter-month">Bulan:</label>
									<select
										id="filter-month"
										bind:value={filterMonth}
										class="custom-select-box"
									>
										<option value="all">Semua Bulan</option>
										{#each monthList as m}
											<option value={m.val}
												>{m.name}</option
											>
										{/each}
									</select>
								</div>
								<div class="custom-field-group">
									<label for="filter-year">Tahun:</label>
									<select
										id="filter-year"
										bind:value={filterYear}
										class="custom-select-box"
									>
										<option value="all">Semua Tahun</option>
										{#each yearList as y}
											<option value={y}>{y}</option>
										{/each}
									</select>
								</div>
							{:else if timeFilterMode === "range"}
								<div class="custom-field-group">
									<label for="filter-start">Dari:</label>
									<input
										id="filter-start"
										type="date"
										bind:value={filterStartDate}
										class="custom-input-box"
									/>
								</div>
								<div class="custom-field-group">
									<label for="filter-end">Sampai:</label>
									<input
										id="filter-end"
										type="date"
										bind:value={filterEndDate}
										class="custom-input-box"
									/>
								</div>
							{:else if timeFilterMode === "date"}
								<div class="custom-field-group">
									<label for="filter-specific">Tanggal:</label
									>
									<input
										id="filter-specific"
										type="date"
										bind:value={filterSpecificDate}
										class="custom-input-box"
									/>
								</div>
							{/if}

							<button
								type="button"
								class="btn-close-custom-panel"
								onclick={() => (showCustomPicker = false)}
							>
								✓ Terapkan &amp; Tutup
							</button>
						</div>
					</div>
				{/if}
			</div>

			<!-- ================== KARTU TOTAL MASING-MASING PT (SESUAI PILIHAN NAVBAR) ================== -->
			{#if page === "debts"}
				<div class="pt-summary-grid single-pt-grid">
					<div
						class="pt-summary-card single-company-card card-{currentCompanyCode.toLowerCase()}"
					>
						<div class="card-pt-head">
							<div
								style="display:flex; align-items:center; gap:0.6rem;"
							>
								<span
									class="pt-tag tag-{currentCompanyCode.toLowerCase()}"
									>PT {data.currentCompany?.code}</span
								>
								<span class="pt-fullname"
									>{data.currentCompany?.name}</span
								>
							</div>
							<span class="card-period-pill"
								>📅 Periode: {activePeriodLabel}</span
							>
						</div>
						<div class="card-pt-amount">
							{rp(summaryDebtsCurrent.totalRemaining)}
						</div>
						<div class="card-pt-foot">
							<span
								>📌 {summaryDebtsCurrent.count} Bon Belum Lunas</span
							>
							<span class="card-action-hint"
								>Total OS Hutang PT {data.currentCompany
									?.code}</span
							>
						</div>
					</div>
				</div>
			{:else if page === "history"}
				<div class="pt-summary-grid single-pt-grid">
					<div
						class="pt-summary-card single-company-card card-{currentCompanyCode.toLowerCase()}"
					>
						<div class="card-pt-head">
							<div
								style="display:flex; align-items:center; gap:0.6rem;"
							>
								<span
									class="pt-tag tag-{currentCompanyCode.toLowerCase()}"
									>PT {data.currentCompany?.code}</span
								>
								<span class="pt-fullname"
									>{data.currentCompany?.name}</span
								>
							</div>
							<span class="card-period-pill"
								>📅 Periode: {activePeriodLabel}</span
							>
						</div>
						<div class="card-pt-amount green">
							{rp(summaryPaidCurrent.totalPaid)}
						</div>
						<div class="card-pt-foot">
							<span
								>✅ {summaryPaidCurrent.count} Transaksi Telah Lunas</span
							>
							<span class="card-action-hint"
								>Total Pelunasan PT {data.currentCompany
									?.code}</span
							>
						</div>
					</div>
				</div>
			{:else if page === "balance"}
				<div class="pt-summary-grid single-pt-grid">
					<div
						class="pt-summary-card single-company-card card-{currentCompanyCode.toLowerCase()}"
					>
						<div class="card-pt-head">
							<div
								style="display:flex; align-items:center; gap:0.6rem;"
							>
								<span
									class="pt-tag tag-{currentCompanyCode.toLowerCase()}"
									>PT {data.currentCompany?.code}</span
								>
								<span class="pt-fullname"
									>{data.currentCompany?.name}</span
								>
							</div>
							<span class="card-period-pill"
								>📅 Periode: {activePeriodLabel}</span
							>
						</div>
						<div class="card-pt-amount green">
							{summaryBalanceCurrent.latestBalance !== null
								? rp(summaryBalanceCurrent.latestBalance)
								: "Belum Ada Data Saldo"}
						</div>
						<div class="card-pt-foot">
							<span
								>💰 {summaryBalanceCurrent.count} Catatan Saldo Kas
								Tercatat</span
							>
							<span class="card-action-hint"
								>Sisa Saldo Kas PT {data.currentCompany
									?.code}</span
							>
						</div>
					</div>
				</div>
			{/if}

			<!-- ================ OS HUTANG AKTIF ================ -->
			{#if page === "debts"}
				<!-- Aging Summary 5 Bucket -->
				<div class="aging-bar">
					<button
						onclick={() =>
							(agingFilter =
								agingFilter === "0-30" ? "all" : "0-30")}
						class="aging-card aging-0-30"
						style="cursor:pointer; border: {agingFilter === '0-30'
							? '2px solid #16a34a'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">0 – 30 Hari</div>
						<div class="aging-amount">
							{rp(activeAgingBuckets.b0_30)}
						</div>
						<div class="aging-sub">Lancar</div>
					</button>

					<button
						onclick={() =>
							(agingFilter =
								agingFilter === "31-60" ? "all" : "31-60")}
						class="aging-card aging-31-60"
						style="cursor:pointer; border: {agingFilter === '31-60'
							? '2px solid #d97706'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">31 – 60 Hari</div>
						<div class="aging-amount">
							{rp(activeAgingBuckets.b31_60)}
						</div>
						<div class="aging-sub">Perlu Perhatian</div>
					</button>

					<button
						onclick={() =>
							(agingFilter =
								agingFilter === "61-90" ? "all" : "61-90")}
						class="aging-card aging-61-90"
						style="cursor:pointer; border: {agingFilter === '61-90'
							? '2px solid #ea580c'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">61 – 90 Hari</div>
						<div class="aging-amount">
							{rp(activeAgingBuckets.b61_90)}
						</div>
						<div class="aging-sub">Menumpuk</div>
					</button>

					<button
						onclick={() =>
							(agingFilter =
								agingFilter === "91-120" ? "all" : "91-120")}
						class="aging-card aging-91-120"
						style="cursor:pointer; border: {agingFilter === '91-120'
							? '2px solid #dc2626'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">91 – 120 Hari</div>
						<div class="aging-amount">
							{rp(activeAgingBuckets.b91_120)}
						</div>
						<div class="aging-sub">Kritis</div>
					</button>

					<button
						onclick={() =>
							(agingFilter =
								agingFilter === ">120" ? "all" : ">120")}
						class="aging-card aging-over120"
						style="cursor:pointer; border: {agingFilter === '>120'
							? '2px solid #7c3aed'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">&gt; 120 Hari</div>
						<div class="aging-amount">
							{rp(activeAgingBuckets.b_over120)}
						</div>
						<div class="aging-sub">Sangat Lama</div>
					</button>
				</div>

				<!-- Filter & Cari -->
				<div class="toolbar">
					<div class="filter-tabs">
						<button
							class="filter-tab"
							class:active={agingFilter === "all"}
							onclick={() => (agingFilter = "all")}
						>
							Semua ({data.activeDebts?.length || 0})
						</button>
						<button
							class="filter-tab"
							class:active={agingFilter === "0-30"}
							onclick={() => (agingFilter = "0-30")}
						>
							0-30 Hari
						</button>
						<button
							class="filter-tab"
							class:active={agingFilter === "31-60"}
							onclick={() => (agingFilter = "31-60")}
						>
							31-60 Hari
						</button>
						<button
							class="filter-tab"
							class:active={agingFilter === "61-90"}
							onclick={() => (agingFilter = "61-90")}
						>
							61-90 Hari
						</button>
						<button
							class="filter-tab"
							class:active={agingFilter === "91-120"}
							onclick={() => (agingFilter = "91-120")}
						>
							91-120 Hari
						</button>
						<button
							class="filter-tab"
							class:active={agingFilter === ">120"}
							onclick={() => (agingFilter = ">120")}
						>
							&gt;120 Hari
						</button>
					</div>

					<div
						class="toolbar-right"
						style="display:flex; align-items:center; gap:0.65rem; flex-wrap:wrap;"
					>
						<!-- Total Yang Harus Dibayar (Masing-masing PT) di sebelah pencarian -->
						<div
							class="debt-total-badge"
							title="Total Seluruh Tagihan yang Belum Dilunasi untuk {data
								.currentCompany?.code}"
						>
							<div class="debt-total-label">
								Total Harus Dibayar ({data.currentCompany
									?.code}):
							</div>
							<div class="debt-total-amount num">
								{rp(summaryDebtsCurrent.totalRemaining)}
							</div>
						</div>

						<!-- Tombol Export Excel & PDF OS Hutang -->
						<div class="export-btn-group">
							<a
								href="/api/export/os-hutang?pt={data
									.currentCompany?.code || 'ART'}&type=excel"
								class="btn-export-excel"
								title="Download Excel OS Hutang Sesuai Template Asli"
							>
								<span>📥</span> Excel
							</a>
							<a
								href="/api/export/os-hutang?pt={data
									.currentCompany?.code || 'ART'}&type=pdf"
								class="btn-export-pdf"
								title="Download Laporan PDF OS Hutang"
							>
								<span>📄</span> PDF
							</a>
						</div>

						<select
							class="sort-select"
							bind:value={debtSortBy}
							title="Urutkan berdasarkan nama supplier (A-Z / Z-A) atau tanggal"
						>
							<option value="date_desc">📅 Tgl: Terbaru</option>
							<option value="date_asc">📅 Tgl: Terlama</option>
							<option value="name_asc">🔤 Supplier: A - Z</option>
							<option value="name_desc">🔤 Supplier: Z - A</option
							>
						</select>

						<input
							class="search-input"
							type="text"
							placeholder="Cari supplier / keterangan..."
							bind:value={search}
						/>
					</div>
				</div>

				<!-- Tabel OS Hutang -->
				<div class="table-card">
					{#if filteredDebts.length === 0}
						<div class="empty-state">
							<div class="empty-icon">📋</div>
							<div class="empty-title">
								Tidak ada tagihan aktif
							</div>
							<div class="empty-desc">
								Klik "+ Catat Bon / Tagihan Baru" untuk
								menambahkan tagihan dari supplier
							</div>
						</div>
					{:else}
						<table class="data-table">
							<thead>
								<tr>
									<th
										class="sortable-th"
										onclick={() =>
											(debtSortBy =
												debtSortBy === "name_asc"
													? "name_desc"
													: "name_asc")}
										title="Klik untuk urutkan nama Supplier A-Z atau Z-A"
									>
										Supplier / Pihak
										<span class="sort-badge">
											{debtSortBy === "name_asc"
												? "↑ A-Z"
												: debtSortBy === "name_desc"
													? "↓ Z-A"
													: "↕"}
										</span>
									</th>
									<th
										class="sortable-th"
										onclick={() =>
											(debtSortBy =
												debtSortBy === "date_desc"
													? "date_asc"
													: "date_desc")}
										title="Klik untuk urutkan Tanggal Bon Terbaru atau Terlama"
									>
										Tgl Bon
										<span class="sort-badge">
											{debtSortBy === "date_desc"
												? "↓ Baru"
												: debtSortBy === "date_asc"
													? "↑ Lama"
													: "↕"}
										</span>
									</th>
									<th>Jatuh Tempo</th>
									<th>Status Waktu</th>
									<th>Aging</th>
									<th style="text-align:right">Tagihan</th>
									<th style="text-align:right">Sisa</th>
									<th>Keterangan</th>
									<th style="text-align:center">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredDebts as d}
									<tr
										class:row-h5={d.urgency === "h5"}
										class:row-overdue={d.urgency ===
											"overdue"}
									>
										<td>
											<div
												style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;"
											>
												<span
													style="font-weight: 600; color: #0f172a;"
													>{d.contact_name}</span
												>
												<span
													class="badge-pt-inline {d.company_code ===
													'ART'
														? 'art'
														: 'knm'}"
													>{d.company_code}</span
												>
											</div>
											{#if d.invoice_no}
												<div
													style="font-size:0.72rem; color:#64748b;"
												>
													No: {d.invoice_no}
												</div>
											{/if}
											<span
												class="badge"
												style="margin-top:3px;"
												class:badge-supplier={d.contact_type ===
													"supplier"}
												class:badge-nonvendor={d.contact_type ===
													"non_vendor"}
											>
												{d.contact_type === "supplier"
													? "Supplier"
													: "Non-Vendor"}
											</span>
										</td>
										<td style="font-size:0.85rem;"
											>{d.invoice_date}</td
										>
										<td>
											<div
												style="font-size:0.85rem; font-weight:600;"
											>
												{d.effective_due_date}
											</div>
											{#if !d.due_date}
												<div
													style="font-size:0.7rem; color:#94a3b8;"
												>
													default 30hr
												</div>
											{/if}
										</td>
										<td>
											{#if d.urgency === "overdue"}
												<span
													class="badge badge-overdue"
													>🚨 Lewat {Math.abs(
														d.days_until_due,
													)} hari</span
												>
											{:else if d.urgency === "h5"}
												<span class="badge badge-h5"
													>⚠️ H-{d.days_until_due}</span
												>
											{:else}
												<span class="badge badge-safe"
													>✅ Aman</span
												>
											{/if}
										</td>
										<td>
											<span
												class="badge {agingClass(
													d.aging_bucket,
												)}">{d.aging_bucket} hr</span
											>
										</td>
										<td style="text-align:right" class="num"
											>{rp(d.amount)}</td
										>
										<td
											style="text-align:right"
											class="num-red"
											>{rp(d.remaining_amount)}</td
										>
										<td
											style="font-size:0.82rem; max-width:200px; color:#334155;"
											>{d.description}</td
										>
										<td
											style="text-align:center; white-space:nowrap;"
										>
											<div
												style="display:inline-flex; gap:0.35rem; align-items:center;"
											>
												<button
													type="button"
													class="btn-detail"
													onclick={() =>
														openDetail(d)}
													title="Lihat Bon / Detail Tagihan"
												>
													👁️ Detail
												</button>
												<button
													type="button"
													class="btn-edit"
													onclick={() => openEdit(d)}
													title="Edit data tagihan / supplier / tipe"
												>
													✏️ Edit
												</button>
												<button
													type="button"
													class="btn-pay"
													onclick={() => openPay(d)}
													>Bayar</button
												>
												<form
													method="POST"
													action="?pt={data
														.currentCompany?.code ||
														'ART'}&/deleteDebt"
													use:enhance
													style="display:inline;"
													onsubmit={(e) => {
														if (
															!confirm(
																"Hapus tagihan ini?",
															)
														)
															e.preventDefault();
													}}
												>
													<input
														type="hidden"
														name="debt_id"
														value={d.id}
													/>
													<button
														type="submit"
														class="btn-delete"
														title="Hapus tagihan"
														>🗑️</button
													>
												</form>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			{/if}

			<!-- ================ TAB BARU: MENUNGGU ACC ATASAN ================ -->
			{#if page === "pending_approval"}
				<!-- Banner Ringkasan Menunggu ACC -->
				<div
					style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; padding:1rem 1.25rem; background:linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border:1px solid #fde68a; border-radius:14px; box-shadow:0 2px 6px rgba(245,158,11,0.08); flex-wrap:wrap; gap:1rem;"
				>
					<div>
						<div
							style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#b45309; letter-spacing:0.5px; display:flex; align-items:center; gap:0.4rem;"
						>
							<span>⏳ ANTREAN PERSETUJUAN (ACC) PEMBAYARAN</span>
							<span
								style="background:#f59e0b; color:#ffffff; font-size:0.7rem; padding:0.1rem 0.45rem; border-radius:12px; font-weight:700;"
							>
								{data.currentCompany?.code}
							</span>
						</div>
						<div
							style="font-size:1.35rem; font-weight:800; color:#92400e; margin-top:0.25rem;"
						>
							{rp(summaryPendingCurrent.totalPending)}
						</div>
						<div
							style="font-size:0.8rem; color:#78350f; margin-top:0.15rem;"
						>
							Terdapat <strong
								>{summaryPendingCurrent.count} pengajuan tagihan</strong
							> yang menunggu persetujuan (ACC) dari Pak Danny sebelum
							dicairkan & masuk ke Sudah Dibayar.
						</div>
					</div>

					<div
						style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;"
					>
						<!-- Tombol Export Excel & PDF Menunggu ACC -->
						<div class="export-btn-group">
							<a
								href="/api/export/menunggu-acc?pt={data
									.currentCompany?.code || 'ART'}&type=excel"
								class="btn-export-excel"
								title="Download Excel Daftar Pengajuan Menunggu ACC untuk dikirim ke WA Bos"
							>
								<span>📥</span> Export Excel
							</a>
							<a
								href="/api/export/menunggu-acc?pt={data
									.currentCompany?.code || 'ART'}&type=pdf"
								class="btn-export-pdf"
								title="Download Laporan PDF Daftar Pengajuan Menunggu ACC untuk dikirim ke WA Bos"
							>
								<span>📄</span> Export PDF
							</a>
						</div>

						<button
							type="button"
							style="background:#25d366; color:#ffffff; font-size:0.82rem; font-weight:700; padding:0.55rem 1rem; border-radius:10px; border:none; cursor:pointer; display:flex; align-items:center; gap:0.4rem; box-shadow:0 2px 8px rgba(37,211,102,0.3); transition:transform 0.15s ease;"
							onclick={sendAllPendingWhatsAppReminder}
							title="Kirim daftar tagihan ke WhatsApp Pak Danny/Pak Carmen"
						>
							<span>📱</span>
							<span
								>Kirim Ringkasan WA ke Pak Danny/ Pak Carmen</span
							>
						</button>
					</div>
				</div>

				<!-- Aging Summary 5 Bucket di Menu Menunggu ACC (Agar Bos Bisa Lihat Jangka Waktu & Prioritas) -->
				<div class="aging-bar" style="margin-bottom:1rem;">
					<button
						type="button"
						onclick={() =>
							(pendingAgingFilter =
								pendingAgingFilter === "0-30" ? "all" : "0-30")}
						class="aging-card aging-0-30"
						style="cursor:pointer; border: {pendingAgingFilter === '0-30'
							? '2px solid #16a34a'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">0 – 30 Hari</div>
						<div class="aging-amount">
							{rp(pendingAgingBuckets.b0_30)}
						</div>
						<div class="aging-sub">Lancar</div>
					</button>

					<button
						type="button"
						onclick={() =>
							(pendingAgingFilter =
								pendingAgingFilter === "31-60" ? "all" : "31-60")}
						class="aging-card aging-31-60"
						style="cursor:pointer; border: {pendingAgingFilter === '31-60'
							? '2px solid #d97706'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">31 – 60 Hari</div>
						<div class="aging-amount">
							{rp(pendingAgingBuckets.b31_60)}
						</div>
						<div class="aging-sub">Perlu Perhatian</div>
					</button>

					<button
						type="button"
						onclick={() =>
							(pendingAgingFilter =
								pendingAgingFilter === "61-90" ? "all" : "61-90")}
						class="aging-card aging-61-90"
						style="cursor:pointer; border: {pendingAgingFilter === '61-90'
							? '2px solid #ea580c'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">61 – 90 Hari</div>
						<div class="aging-amount">
							{rp(pendingAgingBuckets.b61_90)}
						</div>
						<div class="aging-sub">Menumpuk</div>
					</button>

					<button
						type="button"
						onclick={() =>
							(pendingAgingFilter =
								pendingAgingFilter === "91-120" ? "all" : "91-120")}
						class="aging-card aging-91-120"
						style="cursor:pointer; border: {pendingAgingFilter === '91-120'
							? '2px solid #dc2626'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">91 – 120 Hari</div>
						<div class="aging-amount">
							{rp(pendingAgingBuckets.b91_120)}
						</div>
						<div class="aging-sub">Kritis</div>
					</button>

					<button
						type="button"
						onclick={() =>
							(pendingAgingFilter =
								pendingAgingFilter === ">120" ? "all" : ">120")}
						class="aging-card aging-over120"
						style="cursor:pointer; border: {pendingAgingFilter === '>120'
							? '2px solid #7c3aed'
							: '1px solid var(--c-border)'}"
					>
						<div class="aging-label">&gt; 120 Hari</div>
						<div class="aging-amount">
							{rp(pendingAgingBuckets.b_over120)}
						</div>
						<div class="aging-sub">Sangat Lama (Prioritas)</div>
					</button>
				</div>

				<!-- Filter Tab Jangka Waktu Aging di Menu Menunggu ACC -->
				<div class="toolbar" style="margin-bottom:0.85rem;">
					<div class="filter-tabs">
						<button
							type="button"
							class="filter-tab"
							class:active={pendingAgingFilter === "all"}
							onclick={() => (pendingAgingFilter = "all")}
						>
							Semua ({pendingTimeFiltered.length})
						</button>
						<button
							type="button"
							class="filter-tab"
							class:active={pendingAgingFilter === "0-30"}
							onclick={() => (pendingAgingFilter = "0-30")}
						>
							0-30 Hari
						</button>
						<button
							type="button"
							class="filter-tab"
							class:active={pendingAgingFilter === "31-60"}
							onclick={() => (pendingAgingFilter = "31-60")}
						>
							31-60 Hari
						</button>
						<button
							type="button"
							class="filter-tab"
							class:active={pendingAgingFilter === "61-90"}
							onclick={() => (pendingAgingFilter = "61-90")}
						>
							61-90 Hari
						</button>
						<button
							type="button"
							class="filter-tab"
							class:active={pendingAgingFilter === "91-120"}
							onclick={() => (pendingAgingFilter = "91-120")}
						>
							91-120 Hari
						</button>
						<button
							type="button"
							class="filter-tab"
							class:active={pendingAgingFilter === ">120"}
							onclick={() => (pendingAgingFilter = ">120")}
						>
							&gt;120 Hari
						</button>
					</div>
				</div>

				<!-- Bar Pencarian & Info Petunjuk -->
				<div class="debt-toolbar" style="margin-bottom:1rem;">
					<div
						style="display:flex; align-items:center; gap:0.65rem; flex:1; flex-wrap:wrap;"
					>
						<div
							class="search-box"
							style="flex:1; min-width:240px;"
						>
							<span class="search-icon">🔍</span>
							<input
								type="text"
								placeholder="Cari nama supplier, no bon, keterangan, atau pengaju..."
								bind:value={pendingSearch}
							/>
						</div>
						<select
							class="sort-select"
							bind:value={pendingSortBy}
							title="Urutkan daftar antrean ACC berdasarkan prioritas batas waktu, aging, atau nama"
						>
							<option value="expiry_asc">⏰ Sisa Waktu ACC: Paling Mendesak</option>
							<option value="aging_desc">🔥 Prioritas Aging: Terlama (&gt;120 Hari)</option>
							<option value="date_desc">📅 Tgl Nota: Terbaru</option>
							<option value="date_asc">📅 Tgl Nota: Terlama</option>
							<option value="name_asc">🔤 Supplier: A - Z</option>
							<option value="name_desc">🔤 Supplier: Z - A</option>
						</select>
					</div>

					<div
						style="font-size:0.8rem; color:#64748b; display:flex; align-items:center; gap:0.4rem;"
					>
						{#if isBoss}
							<span
								style="background:#e0e7ff; color:#3730a3; padding:0.35rem 0.65rem; border-radius:8px; font-weight:600;"
							>
								👑 Anda login sebagai Pak Danny/Pak Carmen
								(Atasan) — Tekan "ACC & Bayar" untuk menyetujui
								pelunasan.
							</span>
						{:else}
							<span
								style="background:#f1f5f9; color:#475569; padding:0.35rem 0.65rem; border-radius:8px; font-weight:500;"
							>
								💡 Tagihan di bawah sedang menunggu ACC Pak
								Danny. Gunakan tombol WA untuk mengirim
								pengingat.
							</span>
						{/if}
					</div>
				</div>

				<!-- Tabel Daftar Menunggu ACC -->
				<div class="card" style="padding:0; overflow:hidden;">
					{#if filteredPendingDebts.length === 0}
						<div class="empty-state" style="padding:3.5rem 1.5rem;">
							<div
								class="icon"
								style="font-size:2.8rem; margin-bottom:0.6rem;"
							>
								✨
							</div>
							<div
								class="empty-title"
								style="font-size:1.15rem; font-weight:700; color:#1e293b;"
							>
								Tidak Ada Antrean Persetujuan (ACC)
							</div>
							<p
								style="color:#64748b; font-size:0.85rem; max-width:480px; margin:0.35rem auto 1rem;"
							>
								{#if pendingSearch.trim()}
									Tidak ada tagihan yang cocok dengan
									pencarian "{pendingSearch}".
								{:else}
									Semua pengajuan pembayaran telah selesai
									diproses atau belum ada pengajuan baru dari
									menu OS Hutang Aktif.
								{/if}
							</p>
							<button
								type="button"
								class="btn-primary"
								onclick={() => (page = "debts")}
								style="font-size:0.82rem;"
							>
								Lihat OS Hutang Aktif ➔
							</button>
						</div>
					{:else}
						<table class="table" style="width:100%;">
							<thead>
								<tr>
									<th style="width:42px;">No</th>
									<th>Supplier / Toko</th>
									<th>No. Bon & Ket</th>
									<th>Tgl Nota & Tempo</th>
									<th>Jangka Waktu (Aging)</th>
									<th>Total Bon</th>
									<th
										style="background:#fffbeb; color:#92400e;"
										>Nominal Diajukan</th
									>
									<th>Batas Waktu ACC (Countdown)</th>
									<th>Diajukan Oleh</th>
									<th style="text-align:right;">Aksi</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredPendingDebts as d, i}
									{@const cd = formatAccCountdown(d.pending_expires_ts, nowTick)}
									<tr
										style="transition:background 0.15s ease;"
										class:row-overdue={cd.level === "critical" || d.urgency === "overdue"}
										class:row-h5={cd.level === "warning" || d.urgency === "h5"}
									>
										<td
											style="color:#94a3b8; font-weight:600;"
											>{i + 1}</td
										>
										<td>
											<div
												style="font-weight:700; color:#0f172a; font-size:0.9rem;"
											>
												{d.contact_name}
											</div>
											<div
												style="font-size:0.72rem; color:#64748b;"
											>
												{d.company_code ||
													data.currentCompany?.code} •
												{d.contact_type === "supplier"
													? "Supplier"
													: "Non-Vendor"}
											</div>
										</td>
										<td>
											<div
												style="font-family:monospace; font-weight:600; color:#475569; font-size:0.82rem;"
											>
												{d.invoice_no || "-"}
											</div>
											<div
												style="font-size:0.78rem; color:#64748b; max-width:210px; white-space:normal;"
											>
												{d.description}
											</div>
										</td>
										<td>
											<div
												style="font-weight:600; color:#334155; font-size:0.82rem;"
											>
												Nota: {d.invoice_date || "-"}
											</div>
											<div
												style="font-size:0.73rem; color:#64748b; margin-top:2px;"
											>
												Tempo: <strong>{d.effective_due_date || "-"}</strong>
											</div>
										</td>
										<td>
											<div style="display:flex; flex-direction:column; gap:0.25rem; align-items:flex-start;">
												<span class="badge {agingClass(d.aging_bucket)}">
													{d.aging_bucket} hr ({d.days_overdue} hari)
												</span>
												{#if d.urgency === "overdue"}
													<span class="badge badge-overdue" style="font-size:0.68rem;">
														🚨 Lewat {Math.abs(d.days_until_due)} hr
													</span>
												{:else if d.urgency === "h5"}
													<span class="badge badge-h5" style="font-size:0.68rem;">
														⚠️ H-{d.days_until_due} hr
													</span>
												{:else}
													<span class="badge badge-safe" style="font-size:0.68rem;">
														✅ Aman
													</span>
												{/if}
											</div>
										</td>
										<td>
											<div
												style="font-weight:600; color:#64748b; font-size:0.85rem;"
											>
												{rp(d.amount)}
											</div>
											{#if d.paid_amount > 0}
												<div
													style="font-size:0.7rem; color:#16a34a;"
												>
													Sudah cicil: {rp(
														d.paid_amount,
													)}
												</div>
											{/if}
										</td>
										<td style="background:#fffdf5;">
											<div
												style="font-weight:800; color:#b45309; font-size:0.95rem;"
											>
												{rp(
													d.pending_amount ||
														d.remaining_amount,
												)}
											</div>
										</td>
										<td>
											{#if d.pending_expires_ts}
												<div
													style="display:inline-flex; flex-direction:column; gap:0.15rem; padding:0.35rem 0.6rem; border-radius:8px; font-family:monospace; font-weight:800; font-size:0.82rem; border:1px solid {cd.level === 'critical' ? '#fca5a5' : cd.level === 'warning' ? '#fcd34d' : '#bfdbfe'}; background:{cd.level === 'critical' ? '#fef2f2' : cd.level === 'warning' ? '#fffbeb' : '#eff6ff'}; color:{cd.level === 'critical' ? '#b91c1c' : cd.level === 'warning' ? '#b45309' : '#1d4ed8'};"
												>
													<span>⏱️ {cd.text}</span>
													<span style="font-family:inherit; font-size:0.68rem; font-weight:700;">
														{cd.sub}
													</span>
												</div>
												<div style="font-size:0.7rem; color:#64748b; margin-top:3px;">
													Batas Tgl: <strong>{d.pending_payment_date || "-"}</strong>
												</div>
											{:else}
												<div style="font-weight:600; color:#334155; font-size:0.82rem;">
													Target: {d.pending_payment_date || d.invoice_date}
												</div>
												<span
													style="display:inline-flex; align-items:center; gap:0.2rem; font-size:0.68rem; font-weight:700; background:#fef3c7; color:#92400e; padding:0.15rem 0.45rem; border-radius:12px; margin-top:3px;"
												>
													⏳ Menunggu ACC
												</span>
											{/if}
										</td>
										<td>
											<div
												style="font-weight:600; color:#1e293b; font-size:0.82rem;"
											>
												{d.pending_by ||
													"Petugas Keuangan"}
											</div>
											{#if d.pending_notes}
												<div
													style="font-size:0.72rem; color:#475569; font-style:italic; max-width:180px; white-space:normal; margin-top:0.15rem;"
												>
													"{d.pending_notes}"
												</div>
											{/if}
										</td>
										<td style="text-align:right;">
											<div
												style="display:flex; justify-content:flex-end; align-items:center; gap:0.4rem; flex-wrap:wrap;"
											>
												{#if isBoss}
													<!-- Tombol ACC & Bayar (Khusus Atasan) -->
													<button
														type="button"
														style="background:#16a34a; color:#ffffff; border:none; border-radius:6px; padding:0.4rem 0.65rem; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.25rem; box-shadow:0 1px 4px rgba(22,163,74,0.3);"
														onclick={() =>
															openApproveModal(
																d,
																false,
															)}
														title="Setujui dan selesaikan pembayaran tagihan ini"
													>
														<span>✅</span> ACC & Bayar
													</button>

													<!-- Tombol Tolak ACC (Khusus Atasan) -->
													<button
														type="button"
														style="background:#dc2626; color:#ffffff; border:none; border-radius:6px; padding:0.4rem 0.65rem; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.25rem;"
														onclick={() =>
															openRejectModal(d)}
														title="Tolak pengajuan dan kembalikan ke menu OS Hutang"
													>
														<span>❌</span> Tolak
													</button>
												{:else}
													<!-- Tombol ACC by WhatsApp (Untuk Admin jika sudah di-ACC Bos lewat WA) -->
													<button
														type="button"
														style="background:#059669; color:#ffffff; border:none; border-radius:6px; padding:0.4rem 0.65rem; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.25rem; box-shadow:0 1px 4px rgba(5,150,105,0.3);"
														onclick={() =>
															openApproveModal(
																d,
																true,
															)}
														title="Langsung ACC jika Pak Carmen atau Pak Danny sudah setuju lewat WhatsApp"
													>
														<span>✅</span> ACC by WA
													</button>

													<!-- Tombol WhatsApp Pengingat (Untuk Staff) -->
													<button
														type="button"
														style="background:#25d366; color:#ffffff; border:none; border-radius:6px; padding:0.4rem 0.65rem; font-size:0.75rem; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:0.25rem; box-shadow:0 1px 4px rgba(37,211,102,0.3);"
														onclick={() =>
															sendWhatsAppReminder(
																d,
															)}
														title="Kirim pesan WhatsApp pengingat langsung ke Pak Danny / Pak Carmen"
													>
														<span>🔔</span> Ingatkan
														Bos
													</button>

													<!-- Tombol Batal Ajukan (Tarik Kembali ke OS Hutang) -->
													<form
														method="POST"
														action="?pt={data
															.currentCompany
															?.code ||
															'ART'}&/cancelApprovalRequest"
														use:enhance={() => {
															return async ({
																result,
																update,
															}) => {
																if (
																	result.type ===
																	"success"
																) {
																	notify(
																		"info",
																		"Pengajuan Ditarik",
																		"Tagihan telah dikembalikan ke menu OS Hutang Aktif.",
																	);
																}
																await update();
															};
														}}
														style="display:inline;"
														onsubmit={(e) => {
															if (
																!confirm(
																	"Tarik kembali pengajuan ini dan kembalikan ke OS Hutang?",
																)
															) {
																e.preventDefault();
															}
														}}
													>
														<input
															type="hidden"
															name="debt_id"
															value={d.id}
														/>
														<button
															type="submit"
															style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:6px; padding:0.4rem 0.6rem; font-size:0.75rem; font-weight:600; cursor:pointer;"
															title="Batalkan pengajuan dan kembalikan ke OS Hutang"
														>
															↩️ Batal
														</button>
													</form>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			{/if}

			<!-- ================ HISTORI SUDAH DIBAYAR ================ -->
			{#if page === "history"}
				<!-- Banner Total Pembayaran -->
				<div
					style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding:0.85rem 1.25rem; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.04); flex-wrap:wrap; gap:1rem;"
				>
					<div>
						<div
							style="font-size:0.78rem; text-transform:uppercase; font-weight:700; color:#166534; letter-spacing:0.5px;"
						>
							Total Tagihan Telah Dilunasi ({data.currentCompany
								?.code})
						</div>
						<div
							style="font-size:0.85rem; color:#475569; margin-top:0.15rem;"
						>
							Jumlah tagihan lunas: <strong
								>{data.paidDebts?.length || 0} transaksi</strong
							>
						</div>
					</div>
					<div
						style="display:flex; align-items:center; gap:0.85rem; flex-wrap:wrap;"
					>
						<!-- Pengaturan Download Per Hari vs Sesuai Periode -->
						<div
							style="display:flex; align-items:center; gap:0.45rem; background:#ffffff; padding:0.35rem 0.65rem; border-radius:10px; border:1px solid #86efac; flex-wrap:wrap;"
						>
							<select
								bind:value={exportPaidMode}
								style="border:none; background:transparent; font-size:0.78rem; font-weight:700; color:#166534; cursor:pointer; outline:none;"
								title="Pilih mode download laporan pembayaran"
							>
								<option value="daily"
									>📅 Download Per Hari:</option
								>
								<option value="period"
									>🗓️ Download Sesuai Filter Periode</option
								>
							</select>

							{#if exportPaidMode === "daily"}
								<input
									type="date"
									bind:value={exportPaidDate}
									onchange={() => {
										timeFilterMode = "date";
										filterSpecificDate = exportPaidDate;
										activePreset =
											exportPaidDate === todayISODate
												? "today"
												: "custom";
									}}
									style="border:1px solid #cbd5e1; border-radius:6px; padding:0.2rem 0.45rem; font-size:0.78rem; font-weight:600; color:#0f172a;"
									title="Pilih tanggal pembayaran yang ingin didownload (tidak digabung dengan hari kemarin)"
								/>
								{#if exportPaidDate !== todayISODate}
									<button
										type="button"
										onclick={() => {
											exportPaidDate = todayISODate;
											timeFilterMode = "date";
											filterSpecificDate = todayISODate;
											activePreset = "today";
										}}
										style="background:#dcfce7; color:#166534; border:1px solid #86efac; border-radius:5px; padding:0.18rem 0.45rem; font-size:0.72rem; font-weight:700; cursor:pointer;"
									>
										Hari Ini
									</button>
								{/if}
							{/if}
						</div>

						<!-- Tombol Export Excel & PDF Data Pembayaran -->
						<div class="export-btn-group">
							<a
								href="/api/export/pembayaran?{exportPembayaranQuery}&type=excel"
								class="btn-export-excel"
								title="Download Excel Data Pembayaran ({exportPaidMode ===
								'daily'
									? 'Harian: ' + exportPaidDate
									: activePeriodLabel})"
							>
								<span>📥</span> Excel {exportPaidMode ===
								"daily"
									? `(${exportPaidDate})`
									: ""}
							</a>
							<a
								href="/api/export/pembayaran?{exportPembayaranQuery}&type=pdf"
								class="btn-export-pdf"
								title="Download Laporan PDF Data Pembayaran ({exportPaidMode ===
								'daily'
									? 'Harian: ' + exportPaidDate
									: activePeriodLabel})"
							>
								<span>📄</span> PDF {exportPaidMode === "daily"
									? `(${exportPaidDate})`
									: ""}
							</a>
						</div>

						<div style="text-align:right;">
							<div
								style="font-size:0.75rem; color:#166534; font-weight:600;"
							>
								Total Dana Keluar:
							</div>
							<div
								style="font-size:1.4rem; font-weight:800; color:#15803d;"
							>
								{rp(summaryPaidCurrent.totalPaid)}
							</div>
						</div>
					</div>
				</div>

				<!-- Form Input Pengeluaran / Pembayaran Langsung (Tanpa Bon) -->
				<div
					id="form-pengeluaran-langsung"
					style="background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%); border-radius:12px; padding:1.25rem 1.5rem; border:2px solid #86efac; margin-bottom:1.5rem; box-shadow:0 4px 15px -3px rgba(16,185,129,0.08);"
				>
					<div
						style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:0.5rem;"
					>
						<h3
							style="margin:0; font-size:1.05rem; font-weight:700; color:#065f46; display:flex; align-items:center; gap:0.5rem;"
						>
							<span>💸</span> Form Pengeluaran / Belanja Langsung
							(Tanpa Bon) — PT {data.currentCompany?.code}
						</h3>
						<span
							style="font-size:0.75rem; background:#dcfce7; color:#166534; padding:0.25rem 0.65rem; border-radius:20px; font-weight:700; border:1px solid #bbf7d0;"
						>
							✨ Otomatis Masuk Sudah Dibayar (Lunas)
						</span>
					</div>
					<p
						style="margin:0 0 1rem 0; font-size:0.82rem; color:#475569;"
					>
						Gunakan form ini untuk mencatat pembayaran karyawan
						(gaji/kasbon), belanja operasional, atau pembelian tanpa
						bon/nota yang langsung dibayarkan tunai.
					</p>

					<form
						method="POST"
						action="?pt={data.currentCompany?.code ||
							'ART'}&/addDirectPayment"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === "success") {
									notify(
										"success",
										"Pengeluaran Berhasil Dicatat! 💸",
										"Data pembayaran langsung telah tersimpan dan otomatis lunas.",
									);
									if (soundEnabled) sound.playAman();
									directPaymentAmount = "";
								}
								await update();
							};
						}}
					>
						<input
							type="hidden"
							name="company_id"
							value={data.currentCompany?.id}
						/>

						<div
							style="display:grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap:1rem; align-items:flex-end;"
						>
							<!-- 1. UNTUK SIAPA -->
							<div>
								<label
									for="input-direct-recipient"
									style="display:block; font-size:0.82rem; font-weight:700; color:#1e293b; margin-bottom:0.35rem;"
								>
									Untuk Siapa (Karyawan / Toko / Belanja) <span
										style="color:#ef4444;">*</span
									>
								</label>
								<input
									id="input-direct-recipient"
									type="text"
									name="recipient"
									list="recipient-suggestions"
									placeholder="Contoh: Budi (Karyawan) / Toko ATK"
									required
									style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.88rem; outline:none;"
								/>
								<datalist id="recipient-suggestions">
									{#each data.contacts || [] as c}
										<option value={c.name}></option>
									{/each}
								</datalist>
							</div>

							<!-- 2. TANGGAL -->
							<div>
								<label
									for="input-direct-date"
									style="display:block; font-size:0.82rem; font-weight:700; color:#1e293b; margin-bottom:0.35rem;"
								>
									Tanggal Pengeluaran <span
										style="color:#ef4444;">*</span
									>
								</label>
								<input
									id="input-direct-date"
									type="date"
									name="payment_date"
									value={todayISODate}
									required
									style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.88rem; outline:none;"
								/>
							</div>

							<!-- 3. JUMLAH NOMINAL -->
							<div>
								<label
									for="input-direct-amount"
									style="display:block; font-size:0.82rem; font-weight:700; color:#1e293b; margin-bottom:0.35rem;"
								>
									Berapa Jumlahnya (Rp) <span
										style="color:#ef4444;">*</span
									>
								</label>
								<div
									style="position:relative; display:flex; align-items:center;"
								>
									<span
										style="position:absolute; left:0.85rem; font-weight:700; font-size:0.88rem; color:#059669;"
										>Rp.</span
									>
									<input
										id="input-direct-amount"
										type="text"
										name="amount"
										placeholder="0"
										value={directPaymentAmount}
										oninput={handleDirectAmountInput}
										required
										style="width:100%; padding:0.65rem 0.85rem 0.65rem 2.8rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.95rem; font-weight:700; color:#065f46; outline:none;"
									/>
								</div>
							</div>

							<!-- 4. KETERANGAN -->
							<div>
								<label
									for="input-direct-desc"
									style="display:block; font-size:0.82rem; font-weight:700; color:#1e293b; margin-bottom:0.35rem;"
								>
									Keterangan / Keperluan <span
										style="color:#ef4444;">*</span
									>
								</label>
								<input
									id="input-direct-desc"
									type="text"
									name="description"
									placeholder="Misal: Kasbon mingguan / Snack rapat"
									required
									style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.88rem; outline:none;"
								/>
							</div>

							<!-- TOMBOL SIMPAN -->
							<div>
								<button
									type="submit"
									class="btn-primary"
									style="width:100%; height:42px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow:0 3px 10px rgba(16,185,129,0.3); justify-content:center;"
								>
									<span>💾</span> Simpan Pengeluaran
								</button>
							</div>
						</div>
					</form>
				</div>

				<!-- Toolbar & Bar Pencarian Supplier / Pihak Sudah Dibayar -->
				<div
					style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; gap:1rem; flex-wrap:wrap;"
				>
					<div
						style="display:flex; align-items:center; gap:0.75rem; flex:1; min-width:280px; max-width:720px;"
					>
						<div style="position:relative; width:100%;">
							<span
								style="position:absolute; left:0.85rem; top:50%; transform:translateY(-50%); color:#64748b; font-size:1rem; pointer-events:none;"
								>🔍</span
							>
							<input
								class="search-input"
								type="text"
								placeholder="Cari nama supplier / pihak yang sudah dibayar..."
								bind:value={paidSearch}
								style="width:100%; padding-left:2.5rem; padding-right:{paidSearch
									? '2.5rem'
									: '1rem'}; height:42px; border-radius:10px; border:1.5px solid #cbd5e1; font-size:0.88rem; box-shadow:0 1px 3px rgba(0,0,0,0.04); background:#ffffff;"
							/>
							{#if paidSearch}
								<button
									type="button"
									onclick={() => (paidSearch = "")}
									title="Hapus pencarian"
									style="position:absolute; right:0.75rem; top:50%; transform:translateY(-50%); background:#e2e8f0; border:none; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-size:0.75rem; color:#475569; cursor:pointer;"
								>
									✕
								</button>
							{/if}
						</div>
						<select
							class="sort-select"
							bind:value={paidSortBy}
							title="Urutkan berdasarkan nama supplier (A-Z / Z-A), Tgl Bayar/ACC, atau Tgl Nota"
							style="height:42px; flex-shrink:0;"
						>
							<option value="date_desc"
								>📅 Tgl Bayar/ACC: Terbaru</option
							>
							<option value="date_asc"
								>📅 Tgl Bayar/ACC: Terlama</option
							>
							<option value="nota_desc"
								>🧾 Tgl Nota/Bon: Terbaru</option
							>
							<option value="nota_asc"
								>🧾 Tgl Nota/Bon: Terlama</option
							>
							<option value="name_asc">🔤 Supplier: A - Z</option>
							<option value="name_desc">🔤 Supplier: Z - A</option
							>
						</select>
					</div>

					<div
						style="display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; color:#475569;"
					>
						{#if paidSearch.trim()}
							<span
								style="background:#e0f2fe; color:#0369a1; padding:0.35rem 0.85rem; border-radius:8px; font-weight:700; border:1px solid #bae6fd; display:flex; align-items:center; gap:0.35rem;"
							>
								<span>🔍</span> Ditemukan: {filteredPaidDebts.length}
								transaksi ({rp(summaryFilteredPaid.total)})
							</span>
							<button
								type="button"
								onclick={() => (paidSearch = "")}
								style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; color:#ef4444; font-size:0.78rem; font-weight:700; padding:0.3rem 0.6rem; cursor:pointer;"
							>
								Reset Pencarian
							</button>
						{:else}
							<span
								style="color:#64748b; font-size:0.82rem; font-weight:500;"
							>
								Total transaksi lunas: <strong
									>{filteredPaidDebts.length} transaksi</strong
								>
							</span>
						{/if}
					</div>
				</div>

				<div class="table-card">
					{#if filteredPaidDebts.length === 0}
						<div class="empty-state">
							{#if paidSearch.trim()}
								<div class="empty-icon">🔍</div>
								<div class="empty-title">
									Tidak ada supplier/transaksi yang cocok
									dengan "{paidSearch}"
								</div>
								<div class="empty-desc">
									Periksa kembali ejaan nama supplier atau
									pihak yang Anda cari di daftar lunas.
								</div>
								<button
									type="button"
									class="btn-secondary"
									style="margin-top:0.75rem; background:#f1f5f9; border:1px solid #cbd5e1; padding:0.4rem 0.9rem; border-radius:8px; font-weight:600; cursor:pointer;"
									onclick={() => (paidSearch = "")}
								>
									Reset Pencarian
								</button>
							{:else}
								<div class="empty-icon">✅</div>
								<div class="empty-title">
									Belum ada tagihan yang lunas
								</div>
								<div class="empty-desc">
									Setelah tagihan dibayar lunas, akan otomatis
									tercatat dan terjumlah di sini
								</div>
							{/if}
						</div>
					{:else}
						<table class="data-table">
							<thead>
								<tr>
									<th
										class="sortable-th"
										onclick={() =>
											(paidSortBy =
												paidSortBy === "name_asc"
													? "name_desc"
													: "name_asc")}
										title="Klik untuk urutkan nama Supplier A-Z atau Z-A"
									>
										Supplier / Pihak
										<span class="sort-badge">
											{paidSortBy === "name_asc"
												? "↑ A-Z"
												: paidSortBy === "name_desc"
													? "↓ Z-A"
													: "↕"}
										</span>
									</th>
									<th>No Nota / Bon</th>
									<th
										class="sortable-th"
										onclick={() =>
											(paidSortBy =
												paidSortBy === "nota_desc"
													? "nota_asc"
													: "nota_desc")}
										title="Klik untuk urutkan Tanggal Nota / Bon Terbaru atau Terlama"
									>
										Tgl Nota / Bon
										<span class="sort-badge">
											{paidSortBy === "nota_desc"
												? "↓ Baru"
												: paidSortBy === "nota_asc"
													? "↑ Lama"
													: "↕"}
										</span>
									</th>
									<th
										class="sortable-th"
										onclick={() =>
											(paidSortBy =
												paidSortBy === "date_desc"
													? "date_asc"
													: "date_desc")}
										title="Klik untuk urutkan Tanggal Bayar / ACC Terbaru atau Terlama"
									>
										Tgl Bayar / ACC
										<span class="sort-badge">
											{paidSortBy === "date_desc"
												? "↓ Baru"
												: paidSortBy === "date_asc"
													? "↑ Lama"
													: "↕"}
										</span>
									</th>
									<th style="text-align:right"
										>Total Tagihan</th
									>
									<th style="text-align:right"
										>Total Dibayar</th
									>
									<th>Keterangan</th>
									<th style="text-align:center; width:90px;"
										>Aksi</th
									>
								</tr>
							</thead>
							<tbody>
								{#each filteredPaidDebts as d}
									<tr>
										<td>
											<div
												style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;"
											>
												<span
													style="font-weight:600; color:#0f172a;"
													>{d.contact_name}</span
												>
												<span
													class="badge-pt-inline {d.company_code ===
													'ART'
														? 'art'
														: 'knm'}"
													>{d.company_code}</span
												>
											</div>
											<span
												class="badge badge-paid"
												style="margin-top:3px;"
												>✅ LUNAS</span
											>
										</td>
										<td
											style="font-size:0.82rem; color:#64748b;"
										>
											{#if d.invoice_no === "Tanpa Bon"}
												<span
													style="display:inline-flex; align-items:center; gap:0.25rem; background:#ecfdf5; color:#047857; font-size:0.75rem; font-weight:700; padding:0.15rem 0.5rem; border-radius:6px; border:1px dashed #a7f3d0;"
												>
													<span>💸</span> Tanpa Bon
												</span>
											{:else}
												{d.invoice_no || "-"}
											{/if}
										</td>
										<td
											style="font-size:0.85rem; color:#475569;"
											>{d.invoice_date || "-"}</td
										>
										<td style="font-size:0.85rem;">
											<div
												style="font-weight:700; color:#15803d;"
											>
												{d.payment_date ||
													d.invoice_date}
											</div>
											{#if d.approved_by}
												<div
													style="font-size:0.68rem; color:#64748b; margin-top:2px;"
												>
													{d.approved_by}
												</div>
											{/if}
										</td>
										<td style="text-align:right" class="num"
											>{rp(d.amount)}</td
										>
										<td
											style="text-align:right; font-weight:700;"
											class="num-green"
											>{rp(d.paid_amount)}</td
										>
										<td
											style="font-size:0.82rem; color:#334155;"
											>{d.description}</td
										>
										<td style="text-align:center;">
											<button
												type="button"
												class="btn-detail"
												onclick={() => openDetail(d)}
												title="Lihat Bon / Bukti Pelunasan"
											>
												👁️ Detail
											</button>

											<form
												method="POST"
												action="?pt={data.currentCompany
													?.code ||
													'ART'}&/deleteDebt"
												use:enhance
												style="display:inline; margin-left:4px;"
												onsubmit={(e) => {
													if (
														!confirm(
															"Hapus data pembayaran ini? Data akan dihapus permanen.",
														)
													) {
														e.preventDefault();
													}
												}}
											>
												<input
													type="hidden"
													name="debt_id"
													value={d.id}
												/>
												<button
													type="submit"
													class="btn-del"
													title="Hapus data pembayaran"
													style="padding:0.35rem 0.5rem; font-size:0.78rem; background:#fee2e2; border:1px solid #fca5a5; color:#b91c1c; border-radius:6px; cursor:pointer;"
												>
													🗑️
												</button>
											</form>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			{/if}

			<!-- ================ LAPORAN SALDO HARIAN ================ -->
			{#if page === "balance"}
				<!-- Form Input Cepat Saldo Harian -->
				<div
					id="form-saldo"
					style="background:#fff; border-radius:12px; padding:1.25rem 1.5rem; border:2px solid #cbd5e1; margin-bottom:1.5rem; box-shadow:0 4px 15px -3px rgba(0,0,0,0.06);"
				>
					<h3
						style="margin:0 0 1rem 0; font-size:1rem; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:0.5rem;"
					>
						<span>✍️</span> Form Input / Perbarui Sisa Saldo Kas PT {data
							.currentCompany?.code}
					</h3>
					<form
						method="POST"
						action="?pt={data.currentCompany?.code ||
							'ART'}&/saveDailyBalance"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === "success") {
									notify(
										"success",
										"Saldo Berhasil Disimpan! 💰",
										"Pencatatan sisa saldo harian telah diperbarui.",
									);
									if (soundEnabled) sound.playAman();
								}
								await update();
							};
						}}
						style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) 130px; gap:0.75rem; align-items:end;"
					>
						<input
							type="hidden"
							name="company_id"
							value={data.currentCompany?.id}
						/>

						<div class="field" style="margin:0;">
							<label
								style="font-size:0.8rem; font-weight:600; color:#475569; display:block; margin-bottom:0.25rem;"
								>Tanggal Saldo</label
							>
							<input
								type="date"
								name="balance_date"
								bind:value={balanceDate}
								required
								style="width:100%; padding:0.5rem 0.75rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88rem;"
							/>
						</div>

						<div class="field" style="margin:0;">
							<label
								style="font-size:0.8rem; font-weight:600; color:#475569; display:block; margin-bottom:0.25rem;"
								>Sisa Saldo Riil</label
							>
							<div class="money-input-wrapper">
								<span class="currency-prefix green">Rp.</span>
								<input
									type="text"
									name="balance_amount"
									placeholder="0"
									bind:value={balanceAmount}
									oninput={handleBalanceInput}
									required
									class="money-input green"
								/>
							</div>
						</div>

						<div class="field" style="margin:0;">
							<label
								style="font-size:0.8rem; font-weight:600; color:#475569; display:block; margin-bottom:0.25rem;"
								>Keterangan / Catatan <span
									style="color:#94a3b8; font-weight:normal;"
									>(opsional)</span
								></label
							>
							<input
								type="text"
								name="notes"
								placeholder="Misal: Sisa kas bank + tunai..."
								bind:value={balanceNotes}
								style="width:100%; padding:0.5rem 0.75rem; border:1px solid #cbd5e1; border-radius:6px; font-size:0.88rem;"
							/>
						</div>

						<button
							type="submit"
							class="btn-primary"
							style="height:38px; background:linear-gradient(135deg, #f43f5e, #ec4899); color:#fff; font-weight:700; border-radius:8px; border:none; cursor:pointer; font-size:0.88rem; display:flex; align-items:center; justify-content:center; gap:0.35rem; width:100%; box-shadow:0 3px 10px rgba(244,63,94,0.3);"
						>
							💾 Simpan Saldo
						</button>
					</form>
					<div
						style="font-size:0.75rem; color:#64748b; margin-top:0.5rem;"
					>
						* Saldo ini tidak dipotong kalkulasi otomatis apa pun.
						Ketik langsung sisa saldo aktual di tanggal tersebut
						sebagai pelaporan resmi harian. Jika tanggal yang sama
						diinput ulang, saldo otomatis terupdate.
					</div>
				</div>

				<!-- Tabel Riwayat Saldo Harian -->
				<div class="table-card">
					{#if filteredDailyBalances.length === 0}
						<div class="empty-state">
							<div class="empty-icon">📊</div>
							<div class="empty-title">
								Belum ada riwayat saldo untuk {data
									.currentCompany?.code}
							</div>
							<div class="empty-desc">
								Gunakan form di atas untuk mencatat sisa saldo
								riil per tanggal
							</div>
						</div>
					{:else}
						<table class="data-table">
							<thead>
								<tr>
									<th style="width:50px; text-align:center;"
										>No</th
									>
									<th>Tanggal Saldo</th>
									<th>Perusahaan</th>
									<th style="text-align:right;"
										>Sisa Saldo Tercatat</th
									>
									<th>Catatan / Keterangan</th>
									<th>Waktu Pencatatan</th>
									<th style="text-align:center; width:90px;"
										>Aksi</th
									>
								</tr>
							</thead>
							<tbody>
								{#each filteredDailyBalances as b, idx}
									<tr>
										<td
											style="text-align:center; color:#64748b; font-size:0.82rem;"
											>{idx + 1}</td
										>
										<td
											style="font-weight:700; color:#0f172a;"
											>{b.balance_date}</td
										>
										<td>
											<span
												class="badge-pt-inline {b.company_code ===
												'ART'
													? 'art'
													: 'knm'}"
											>
												{b.company_code ||
													data.currentCompany?.code}
											</span>
										</td>
										<td
											style="text-align:right; font-weight:800; font-size:0.95rem; color:#16a34a;"
											class="num"
										>
											{rp(b.balance_amount)}
										</td>
										<td
											style="font-size:0.82rem; color:#475569;"
										>
											{b.notes || "-"}
										</td>
										<td
											style="font-size:0.78rem; color:#94a3b8;"
										>
											{b.created_at_fmt}
										</td>
										<td style="text-align:center;">
											<div
												style="display:flex; gap:0.35rem; justify-content:center;"
											>
												<button
													type="button"
													class="btn-ghost"
													style="padding:0.2rem 0.5rem; font-size:0.75rem; border-radius:4px; border:1px solid #cbd5e1; cursor:pointer;"
													onclick={() => {
														balanceDate =
															b.balance_date;
														balanceAmount =
															Math.round(
																b.balance_amount,
															).toLocaleString(
																"id-ID",
															);
														balanceNotes =
															b.notes || "";
													}}
													title="Edit saldo tanggal ini"
												>
													✏️
												</button>
												<form
													method="POST"
													action="?pt={data
														.currentCompany?.code ||
														'ART'}&/deleteDailyBalance"
													use:enhance
													onsubmit={(e) => {
														if (
															!confirm(
																"Hapus catatan saldo tanggal ini?",
															)
														)
															e.preventDefault();
													}}
												>
													<input
														type="hidden"
														name="balance_id"
														value={b.id}
													/>
													<button
														type="submit"
														class="btn-delete"
														title="Hapus catatan"
														style="cursor:pointer;"
														>🗑️</button
													>
												</form>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- ============ MODAL: PENGELUARAN LANGSUNG (TANPA BON) ============ -->
{#if showDirectModal}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal" style="max-width:560px;">
			<div
				class="modal-head"
				style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color:white;"
			>
				<h2
					style="color:white; margin:0; font-size:1.15rem; display:flex; align-items:center; gap:0.5rem;"
				>
					<span>💸</span> Catat Pembayaran / Belanja Langsung (Tanpa Bon)
				</h2>
				<button
					class="btn-close"
					style="color:white; background:rgba(255,255,255,0.2);"
					onclick={closeDirectModal}>✕</button
				>
			</div>
			<form
				method="POST"
				action="?pt={data.currentCompany?.code ||
					'ART'}&/addDirectPayment"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === "success") {
							closeDirectModal();
							notify(
								"success",
								"Pengeluaran Berhasil Dicatat! 💸",
								"Data pembayaran langsung telah tersimpan dan otomatis lunas.",
							);
							if (soundEnabled) sound.playAman();
						}
						await update();
					};
				}}
			>
				<input
					type="hidden"
					name="company_id"
					value={data.currentCompany?.id}
				/>
				<div
					class="modal-body"
					style="padding:1.5rem; display:flex; flex-direction:column; gap:1.1rem;"
				>
					<div
						style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:0.75rem 1rem; font-size:0.82rem; color:#166534;"
					>
						📌 Pengeluaran ini dicatat untuk <strong
							>{data.currentCompany?.code} ({data.currentCompany
								?.name})</strong
						>
						dan otomatis berstatus <strong>LUNAS</strong> di menu Sudah
						Dibayar.
					</div>

					<!-- 1. UNTUK SIAPA -->
					<div class="field">
						<label
							style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:0.4rem; color:#1e293b;"
						>
							Untuk Siapa (Karyawan / Belanja / Pihak Penerima) <span
								style="color:#ef4444;">*</span
							>
						</label>
						<input
							type="text"
							name="recipient"
							list="recipient-suggestions-modal"
							placeholder="Contoh: Budi (Karyawan) / Toko Bangunan / Belanja ATK"
							required
							style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.9rem; outline:none;"
						/>
						<datalist id="recipient-suggestions-modal">
							{#each data.contacts || [] as c}
								<option value={c.name}></option>
							{/each}
						</datalist>
					</div>

					<!-- 2. TANGGAL -->
					<div class="field">
						<label
							style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:0.4rem; color:#1e293b;"
						>
							Tanggal Pengeluaran / Pembayaran <span
								style="color:#ef4444;">*</span
							>
						</label>
						<input
							type="date"
							name="payment_date"
							value={todayISODate}
							required
							style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.9rem; outline:none;"
						/>
					</div>

					<!-- 3. JUMLAH NOMINAL -->
					<div class="field">
						<label
							style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:0.4rem; color:#1e293b;"
						>
							Berapa Jumlahnya (Rp) <span style="color:#ef4444;"
								>*</span
							>
						</label>
						<div
							style="position:relative; display:flex; align-items:center;"
						>
							<span
								style="position:absolute; left:0.85rem; font-weight:700; font-size:0.9rem; color:#059669;"
								>Rp.</span
							>
							<input
								type="text"
								name="amount"
								placeholder="0"
								value={directPaymentModalAmount}
								oninput={handleDirectModalAmountInput}
								required
								style="width:100%; padding:0.65rem 0.85rem 0.65rem 2.8rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:1rem; font-weight:700; color:#065f46; outline:none;"
							/>
						</div>
					</div>

					<!-- 4. KETERANGAN -->
					<div class="field">
						<label
							style="display:block; font-size:0.85rem; font-weight:700; margin-bottom:0.4rem; color:#1e293b;"
						>
							Keterangan / Keperluan Pengeluaran <span
								style="color:#ef4444;">*</span
							>
						</label>
						<textarea
							name="description"
							rows="2"
							placeholder="Misal: Kasbon mingguan karyawan / Belanja operasional kantor"
							required
							style="width:100%; padding:0.65rem 0.85rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.9rem; outline:none; resize:vertical;"
						></textarea>
					</div>
				</div>

				<div
					class="modal-foot"
					style="padding:1rem 1.5rem; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:0.75rem;"
				>
					<button
						type="button"
						class="btn-cancel"
						onclick={closeDirectModal}>Batal</button
					>
					<button
						type="submit"
						class="btn-primary"
						style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); box-shadow:0 3px 10px rgba(16,185,129,0.3);"
					>
						💾 Simpan Pembayaran Langsung
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ============ MODAL: CATAT BON BARU ============ -->
{#if showAdd}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-head">
				<h2>Catat Bon / Tagihan Baru</h2>
				<button class="btn-close" onclick={closeAdd}>✕</button>
			</div>
			<form
				method="POST"
				action="?pt={data.currentCompany?.code || 'ART'}&/addDebt"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === "success") {
							closeAdd();
							notify(
								"success",
								"Bon Berhasil Disimpan! ✅",
								"Data bon baru berhasil dimasukkan ke sistem " +
									(data.currentCompany?.code || ""),
							);
							if (soundEnabled) sound.playAman();
						}
						await update();
					};
				}}
			>
				<input
					type="hidden"
					name="company_id"
					value={data.currentCompany?.id}
				/>
				<div class="modal-body">
					<!-- Nama Supplier -->
					<div class="field">
						<label>Dari Supplier / Toko</label>
						<div
							style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.35rem; flex-wrap:wrap;"
						>
							<label
								style="font-size:0.78rem; display:flex; align-items:center; gap:0.3rem; cursor:pointer;"
							>
								<input
									type="radio"
									bind:group={isNewSupplier}
									value={false}
								/> Pilih yang sudah ada
							</label>
							<label
								style="font-size:0.78rem; display:flex; align-items:center; gap:0.3rem; cursor:pointer;"
							>
								<input
									type="radio"
									bind:group={isNewSupplier}
									value={true}
								/> Tambah supplier baru
							</label>
						</div>

						{#if !isNewSupplier}
							{@const selectedObj = data.contacts?.find(
								(c: any) =>
									String(c.id) === String(selectedContactId),
							)}
							<select
								name="contact_id"
								bind:value={selectedContactId}
								onchange={() => {
									const found = data.contacts?.find(
										(c: any) =>
											String(c.id) ===
											String(selectedContactId),
									);
									if (found && found.type)
										addContactType = found.type;
								}}
								required
							>
								<option value=""
									>-- Pilih supplier / pihak yang pernah
									diinput --</option
								>
								{#each data.contacts || [] as c}
									<option value={c.id}
										>{c.name} ({c.type === "non_vendor"
											? "Non-Vendor"
											: "Supplier"})</option
									>
								{/each}
							</select>
							{#if selectedObj}
								<input
									type="hidden"
									name="contact_name"
									value={selectedObj.name}
								/>
							{/if}
							{#if data.contacts?.length === 0}
								<div class="field-hint">
									⚠️ Belum ada supplier yang pernah diinput.
									Pilih "Tambah supplier baru" di atas.
								</div>
							{/if}
						{:else}
							<input
								type="text"
								name="contact_name"
								placeholder="Ketik nama toko / supplier / pihak baru (misal: Kas Negara)..."
								required
							/>
						{/if}

						<div class="radio-group" style="margin-top:0.45rem;">
							<label
								style="cursor:pointer; display:flex; align-items:center; gap:0.35rem;"
							>
								<input
									type="radio"
									name="contact_type"
									value="supplier"
									bind:group={addContactType}
								/> 🏬 Supplier / Toko / Bengkel
							</label>
							<label
								style="cursor:pointer; display:flex; align-items:center; gap:0.35rem;"
							>
								<input
									type="radio"
									name="contact_type"
									value="non_vendor"
									bind:group={addContactType}
								/> 🏢 Non-Vendor (Kas Negara / Pajak / BPJS / Kasbon
								/ dsb)
							</label>
						</div>
					</div>

					<!-- No Invoice & Tanggal Bon -->
					<div class="field-grid">
						<div class="field">
							<label
								>No Invoice / No Bon <span style="color:#94a3b8"
									>(opsional)</span
								></label
							>
							<input
								type="text"
								name="invoice_no"
								placeholder="INV-001 / kosongkan"
							/>
						</div>
						<div class="field">
							<label>Tanggal Bon / Nota</label>
							<input
								type="date"
								name="invoice_date"
								value={todayISODate}
								required
							/>
						</div>
					</div>

					<!-- Jatuh Tempo -->
					<div class="field">
						<label
							style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-weight:600;"
						>
							<input type="checkbox" bind:checked={hasDueDate} />
							<span
								>Ada jatuh tempo khusus? (misal: tempo 1-2
								minggu)</span
							>
						</label>
						{#if hasDueDate}
							<input
								type="date"
								name="due_date"
								style="margin-top:0.3rem;"
								required
							/>
							<input type="hidden" name="has_due" value="yes" />
						{:else}
							<input type="hidden" name="has_due" value="no" />
							<div class="field-hint" style="margin-top:0.2rem;">
								Kalau tidak ada tempo khusus, otomatis dihitung
								30 hari dari tgl bon
							</div>
						{/if}
					</div>

					<!-- Jumlah yang Harus Dibayar dengan Format Rupiah & Titik -->
					<div class="field">
						<label>Jumlah yang Harus Dibayar</label>
						<div class="money-input-wrapper">
							<span class="currency-prefix">Rp.</span>
							<input
								type="text"
								name="amount"
								placeholder="0"
								bind:value={addAmountFormatted}
								oninput={handleAddAmountInput}
								required
								class="money-input"
							/>
						</div>
					</div>

					<!-- Keterangan -->
					<div class="field">
						<label>Keterangan (barang / jasa apa)</label>
						<input
							type="text"
							name="description"
							placeholder="Misal: Pembelian sparepart excavator, Ongkos kirim..."
							required
						/>
					</div>
				</div>
				<div class="modal-foot">
					<button type="button" class="btn-ghost" onclick={closeAdd}
						>Batal</button
					>
					<button type="submit" class="btn-primary"
						>Simpan Tagihan</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ============ MODAL: EDIT DATA TAGIHAN ============ -->
{#if showEdit && editDebtTarget}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-head">
				<h2>✏️ Edit Data Tagihan / Supplier</h2>
				<button class="btn-close" onclick={closeEdit}>✕</button>
			</div>
			<form
				method="POST"
				action="?pt={data.currentCompany?.code || 'ART'}&/updateDebt"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === "success") {
							closeEdit();
							notify(
								"success",
								"Data Tagihan Berhasil Diperbarui! ✅",
								"Perubahan supplier dan data tagihan telah disimpan.",
							);
							if (soundEnabled) sound.playAman();
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="debt_id" value={editDebtTarget.id} />
				<input
					type="hidden"
					name="company_id"
					value={editDebtTarget.company_id || data.currentCompany?.id}
				/>

				<div class="modal-body">
					<!-- Nama Toko / Supplier / Pihak -->
					<div class="field">
						<label for="edit-contact-name"
							>Nama Supplier / Toko / Pihak <span
								style="color:#ef4444;">*</span
							></label
						>
						<input
							id="edit-contact-name"
							type="text"
							name="contact_name"
							list="edit-contact-suggestions"
							bind:value={editContactName}
							placeholder="Misal: Kas Negara / PT Maju Jaya"
							required
						/>
						<datalist id="edit-contact-suggestions">
							{#each data.contacts || [] as c}
								<option value={c.name}></option>
							{/each}
						</datalist>

						<!-- Pilihan Tipe: Supplier vs Non-Vendor -->
						<div class="radio-group" style="margin-top:0.45rem;">
							<label
								style="cursor:pointer; display:flex; align-items:center; gap:0.35rem;"
							>
								<input
									type="radio"
									name="contact_type"
									value="supplier"
									bind:group={editContactType}
								/> 🏬 Supplier / Toko / Bengkel
							</label>
							<label
								style="cursor:pointer; display:flex; align-items:center; gap:0.35rem;"
							>
								<input
									type="radio"
									name="contact_type"
									value="non_vendor"
									bind:group={editContactType}
								/> 🏢 Non-Vendor (Kas Negara / Pajak / BPJS / Kasbon
								/ dsb)
							</label>
						</div>
					</div>

					<!-- No Invoice & Tanggal Bon -->
					<div class="field-grid">
						<div class="field">
							<label for="edit-invoice-no"
								>No Invoice / No Bon <span style="color:#94a3b8"
									>(opsional)</span
								></label
							>
							<input
								id="edit-invoice-no"
								type="text"
								name="invoice_no"
								placeholder="Misal: INV-2026/001"
								bind:value={editInvoiceNo}
							/>
						</div>
						<div class="field">
							<label for="edit-invoice-date"
								>Tanggal Bon / Nota <span style="color:#ef4444;"
									>*</span
								></label
							>
							<input
								id="edit-invoice-date"
								type="date"
								name="invoice_date"
								bind:value={editInvoiceDate}
								required
							/>
						</div>
					</div>

					<!-- Jatuh Tempo -->
					<div class="field">
						<label
							style="display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:600;"
						>
							<input
								type="checkbox"
								name="has_due"
								value="yes"
								bind:checked={editHasDue}
							/>
							Ada tanggal jatuh tempo khusus?
						</label>
						{#if editHasDue}
							<input
								type="date"
								name="due_date"
								bind:value={editDueDate}
								style="margin-top:0.35rem;"
								required={editHasDue}
							/>
						{:else}
							<div class="field-hint">
								Jika tidak diisi, otomatis dihitung 30 hari dari
								tanggal bon.
							</div>
						{/if}
					</div>

					<!-- Nominal Tagihan -->
					<div class="field">
						<label for="edit-amount"
							>Total Tagihan (Rp) <span style="color:#ef4444;"
								>*</span
							></label
						>
						<div class="money-input-wrapper">
							<span class="money-prefix">Rp</span>
							<input
								id="edit-amount"
								type="text"
								name="amount"
								placeholder="0"
								bind:value={editAmountFormatted}
								oninput={(e) => {
									const raw = e.currentTarget.value.replace(
										/\D/g,
										"",
									);
									editAmountFormatted = raw
										? Number(raw).toLocaleString("id-ID")
										: "";
								}}
								required
							/>
						</div>
						{#if editDebtTarget.paid_amount > 0}
							<div
								class="field-hint"
								style="color:#0284c7; margin-top:0.25rem;"
							>
								ℹ️ Sudah pernah dibayar: {rp(
									editDebtTarget.paid_amount,
								)}. Sisa hutang akan otomatis disesuaikan.
							</div>
						{/if}
					</div>

					<!-- Keterangan -->
					<div class="field">
						<label for="edit-description"
							>Keterangan / Keperluan <span style="color:#ef4444;"
								>*</span
							></label
						>
						<input
							id="edit-description"
							type="text"
							name="description"
							placeholder="Misal: Belanja sparepart / Pajak bulanan"
							bind:value={editDescription}
							required
						/>
					</div>
				</div>

				<div class="modal-foot">
					<button type="button" class="btn-ghost" onclick={closeEdit}
						>Batal</button
					>
					<button type="submit" class="btn-primary"
						>💾 Simpan Perubahan</button
					>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- FLOATING TOAST NOTIFICATIONS -->
<div class="toast-container" aria-live="polite">
	{#each toasts as t (t.id)}
		<div class="toast toast-{t.type}">
			<div class="toast-icon">
				{#if t.type === "success"}✅
				{:else if t.type === "warning"}⚠️
				{:else if t.type === "danger"}🚨
				{:else}ℹ️{/if}
			</div>
			<div class="toast-content">
				<div class="toast-title">{t.title}</div>
				<div class="toast-message">{t.message}</div>
			</div>
			<button
				type="button"
				class="toast-close"
				onclick={() => dismissToast(t.id)}
				aria-label="Tutup">✕</button
			>
		</div>
	{/each}
</div>

<!-- ================ MODAL DETAIL BON / SLIP TAGIHAN ================ -->
{#if showDetail && detailDebt}
	<div
		class="modal-overlay"
		role="dialog"
		aria-modal="true"
		style="z-index: 1000;"
	>
		<div
			class="modal modal-detail-bon"
			style="max-width: 680px; width: 95%;"
		>
			<div class="modal-head no-print">
				<div style="display:flex; align-items:center; gap:0.5rem;">
					<span style="font-size:1.2rem;">🧾</span>
					<h2>Faktur Bon Tagihan</h2>
				</div>
				<button
					type="button"
					class="btn-close"
					onclick={closeDetail}
					aria-label="Tutup">✕</button
				>
			</div>

			<div
				class="modal-body"
				style="padding: 1.25rem 1.5rem; background:#f8fafc; max-height:80vh; overflow-y:auto;"
			>
				<!-- KERTAS BON SLIP (PRINTABLE) -->
				<div class="bon-card printable-bon">
					<!-- HEADER KOP BON -->
					<div class="bon-header">
						<div class="bon-company">
							<div class="bon-company-logo">
								{data.currentCompany?.code || "PT"}
							</div>
							<div>
								<div class="bon-company-name">
									{data.currentCompany?.name || "PERUSAHAAN"}
								</div>
								<div class="bon-company-sub">
									Sistem Rekapan & Kontrol Hutang Keuangan
								</div>
							</div>
						</div>

						<!-- STATUS STAMP -->
						<div class="bon-status-wrap">
							{#if detailDebt.status === "paid" || detailDebt.remaining_amount <= 0}
								<div class="bon-stamp stamp-paid">✅ LUNAS</div>
							{:else if detailDebt.paid_amount > 0}
								<div class="bon-stamp stamp-partial">
									⏳ DICICIL
								</div>
							{:else if detailDebt.urgency === "overdue"}
								<div class="bon-stamp stamp-overdue">
									🚨 JATUH TEMPO
								</div>
							{:else}
								<div class="bon-stamp stamp-unpaid">
									📋 BELUM LUNAS
								</div>
							{/if}
						</div>
					</div>

					<div class="bon-divider"></div>

					<!-- TITLE NOTA -->
					<div class="bon-title-section">
						<div class="bon-title">SURAT BON / BUKTI TAGIHAN</div>
						<div class="bon-no">
							NO: <strong
								>{detailDebt.invoice_no ||
									"BON-" +
										String(detailDebt.id).padStart(
											5,
											"0",
										)}</strong
							>
						</div>
					</div>

					<!-- META INFORMASI MITRA & TANGGAL -->
					<div class="bon-meta-grid">
						<div class="bon-meta-box">
							<span class="bon-meta-label"
								>Ditagihkan Oleh (Supplier / Vendor):</span
							>
							<div
								class="bon-meta-val"
								style="font-size:1.05rem; font-weight:800; color:#0f172a;"
							>
								{detailDebt.contact_name}
							</div>
							<div style="margin-top:0.25rem;">
								<span
									class="badge"
									class:badge-supplier={detailDebt.contact_type ===
										"supplier"}
									class:badge-nonvendor={detailDebt.contact_type ===
										"non_vendor"}
								>
									{detailDebt.contact_type === "supplier"
										? "Supplier Resmi"
										: "Pihak Non-Vendor"}
								</span>
							</div>
						</div>

						<div class="bon-meta-box" style="text-align:right;">
							<div>
								<span class="bon-meta-label"
									>Tanggal Terbit Bon:</span
								>
								<div class="bon-meta-val">
									{detailDebt.invoice_date}
								</div>
							</div>
							<div style="margin-top:0.35rem;">
								<span class="bon-meta-label"
									>Batas Jatuh Tempo:</span
								>
								<div
									class="bon-meta-val"
									style="color:{detailDebt.urgency ===
									'overdue'
										? '#b91c1c'
										: '#0f172a'}; font-weight:700;"
								>
									{detailDebt.effective_due_date ||
										detailDebt.due_date ||
										"-"}
								</div>
								{#if detailDebt.status !== "paid" && detailDebt.remaining_amount > 0}
									<div
										style="font-size:0.72rem; margin-top:0.15rem; color:{detailDebt.urgency ===
										'overdue'
											? '#dc2626'
											: detailDebt.urgency === 'h5'
												? '#d97706'
												: '#16a34a'}; font-weight:600;"
									>
										{#if detailDebt.urgency === "overdue"}
											⚠️ Telat {Math.abs(
												detailDebt.days_until_due || 0,
											)} hari
										{:else if detailDebt.urgency === "h5"}
											⏳ H-{detailDebt.days_until_due} hari
											lagi
										{:else if detailDebt.days_until_due}
											✅ Sisa {detailDebt.days_until_due} hari
											lagi
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>

					<!-- RINCIAN TAGIHAN / ITEM NOTA -->
					<div class="bon-items-table-wrap">
						<table class="bon-items-table">
							<thead>
								<tr>
									<th style="width:40px; text-align:center;"
										>No</th
									>
									<th>Rincian / Uraian Keterangan Tagihan</th>
									<th style="text-align:right; width:170px;"
										>Jumlah Nilai</th
									>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td
										style="text-align:center; vertical-align:top; font-weight:600; color:#64748b;"
										>1</td
									>
									<td style="vertical-align:top;">
										<div
											style="font-weight:700; color:#0f172a; font-size:0.95rem; margin-bottom:0.25rem;"
										>
											{detailDebt.description ||
												"Tagihan Pembelian / Pengadaan Operasional"}
										</div>
										<div
											style="font-size:0.75rem; color:#64748b;"
										>
											Unit Pembebanan: PT. {data
												.currentCompany?.code} ({data
												.currentCompany?.name})
										</div>
									</td>
									<td
										style="text-align:right; vertical-align:top; font-weight:700; font-size:1rem; color:#0f172a;"
										class="num"
									>
										{rp(detailDebt.amount)}
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<!-- RINGKASAN REKAPITULASI BON -->
					<div class="bon-summary-grid">
						<div class="bon-summary-left">
							<div class="bon-note-label">
								Catatan Administrasi:
							</div>
							<div class="bon-note-text">
								Bon ini merupakan bukti pencatatan kewajiban
								hutang yang sah pada sistem keuangan PT. {data
									.currentCompany?.code}.
								{#if detailDebt.status === "paid"}
									<div
										style="color:#16a34a; font-weight:700; margin-top:0.35rem;"
									>
										Tagihan ini telah dinyatakan LUNAS dan
										tidak memiliki sisa tanggungan lagi.
									</div>
								{/if}
							</div>
						</div>

						<div class="bon-summary-right">
							<div class="bon-calc-row">
								<span>Total Tagihan:</span>
								<strong class="num"
									>{rp(detailDebt.amount)}</strong
								>
							</div>
							<div class="bon-calc-row" style="color:#16a34a;">
								<span>Sudah Dibayar:</span>
								<strong class="num"
									>{rp(detailDebt.paid_amount || 0)}</strong
								>
							</div>
							<div class="bon-calc-row total-row">
								<span>SISA BON:</span>
								<strong
									class="num"
									style="color:{detailDebt.remaining_amount >
									0
										? '#b91c1c'
										: '#15803d'}; font-size:1.15rem;"
								>
									{rp(detailDebt.remaining_amount || 0)}
								</strong>
							</div>
						</div>
					</div>

					<!-- RIWAYAT PEMBAYARAN JIKA ADA -->
					{#if detailPayments.length > 0}
						<div class="bon-payments-section">
							<div class="bon-payments-title">
								<span>💳</span> Histori Cicilan / Pelunasan Terkait
								Bon Ini:
							</div>
							<table class="bon-payments-table">
								<thead>
									<tr>
										<th>Tgl Nota / Bon</th>
										<th>Tanggal Bayar / ACC</th>
										<th>Nominal Dibayar</th>
										<th>Keterangan / Catatan</th>
									</tr>
								</thead>
								<tbody>
									{#each detailPayments as p}
										<tr>
											<td style="color:#475569;"
												>{detailDebt.invoice_date ||
													"-"}</td
											>
											<td
												style="font-weight:700; color:#15803d;"
												>{p.payment_date}</td
											>
											<td
												style="font-weight:700; color:#16a34a;"
												class="num"
												>{rp(p.amount_paid)}</td
											>
											<td
												style="color:#475569; font-size:0.78rem;"
												>{p.notes || "-"}</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}

					<!-- TANDA TANGAN / PENGESAHAN -->
					<div class="bon-signatures">
						<div class="bon-sign-box">
							<div class="bon-sign-role">Dibuat Oleh,</div>
							<div class="bon-sign-space"></div>
							<div class="bon-sign-line">( Staff Keuangan )</div>
						</div>
						<div class="bon-sign-box">
							<div class="bon-sign-role">Mengetahui,</div>
							<div class="bon-sign-space"></div>
							<div class="bon-sign-line">
								( Manager / Pimpinan )
							</div>
						</div>
						<div class="bon-sign-box">
							<div class="bon-sign-role">
								Supplier / Penerima,
							</div>
							<div class="bon-sign-space"></div>
							<div class="bon-sign-line">
								( {detailDebt.contact_name} )
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- FOOTER ACTION MODAL -->
			<div
				class="modal-foot no-print"
				style="display:flex; justify-content:space-between; align-items:center;"
			>
				<div style="display:flex; gap:0.5rem;">
					<button
						type="button"
						class="btn-ghost"
						onclick={() => window.print()}
						style="display:inline-flex; align-items:center; gap:0.35rem; font-weight:600;"
					>
						<span>🖨️</span> Cetak / Print Bon
					</button>
				</div>
				<div style="display:flex; gap:0.5rem;">
					{#if detailDebt.status !== "paid" && detailDebt.remaining_amount > 0}
						<button
							type="button"
							class="btn-primary"
							style="background:#16a34a; font-size:0.85rem;"
							onclick={() => {
								const target = detailDebt;
								closeDetail();
								openPay(target);
							}}
						>
							💳 Bayar Bon Ini
						</button>
					{/if}
					<button
						type="button"
						class="btn-ghost"
						onclick={closeDetail}
					>
						Tutup
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ============ MODAL: BAYAR TAGIHAN / PENGAJUAN ACC ============ -->
{#if showPay && payDebt}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-head">
				<h2>
					{isBoss
						? "Bayar Tagihan / ACC Langsung"
						: "Pengajuan Pembayaran (Minta ACC Atasan)"}
				</h2>
				<button class="btn-close" onclick={closePay}>✕</button>
			</div>
			<form
				method="POST"
				action="?pt={data.currentCompany?.code || 'ART'}&/{isBoss
					? 'payDebt'
					: 'requestApproval'}"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === "success") {
							closePay();
							if (isBoss) {
								notify(
									"success",
									"Pembayaran Berhasil! 💵",
									"Pembayaran tagihan telah dicatat dan bon telah dilunasi.",
								);
								if (soundEnabled) sound.playAman();
							} else {
								notify(
									"success",
									"Pengajuan Terkirim! 📨",
									"Pengajuan pembayaran telah dikirim ke Pak Danny (menu Menunggu ACC).",
								);
								if (soundEnabled) sound.playAman();
							}
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="debt_id" value={payDebt.id} />
				<div class="modal-body">
					{#if !isBoss}
						<div
							style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:0.6rem 0.85rem; margin-bottom:1rem; font-size:0.78rem; color:#1e40af; display:flex; align-items:center; gap:0.5rem;"
						>
							<span>ℹ️</span>
							<span>
								Pengajuan ini akan masuk ke menu <strong
									>Menunggu ACC</strong
								>
								untuk disetujui oleh
								<strong>Pak Danny (Atasan)</strong> terlebih dahulu
								sebelum berpindah ke menu Sudah Dibayar.
							</span>
						</div>
					{/if}

					<!-- Info tagihan yang dibayar beserta Kategori Aging -->
					<div class="debt-info-box">
						<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem; flex-wrap:wrap;">
							<div>
								<div class="name">{payDebt.contact_name}</div>
								<div class="desc">{payDebt.description}</div>
							</div>
							<span class="badge {agingClass(payDebt.aging_bucket)}">
								Aging: {payDebt.aging_bucket} hr ({payDebt.days_overdue} hari)
							</span>
						</div>
						<div style="font-size:0.75rem; color:#64748b; margin-top:0.35rem;">
							Tgl Nota: <strong>{payDebt.invoice_date}</strong> • Jatuh Tempo Nota: <strong>{payDebt.effective_due_date}</strong>
						</div>
						<div class="amount-row">
							<span style="color:#64748b; font-size:0.82rem;"
								>Sisa yang harus dibayar:</span
							>
							<span class="sisa"
								>{rp(payDebt.remaining_amount)}</span
							>
						</div>
					</div>

					{#if !isBoss}
						<!-- Pengaturan Jangka Waktu / Batas Kadaluarsa ACC (Jumlah Hari -> Otomatis Set Tanggal) -->
						<div style="background:#fffbeb; border:1.5px solid #fde68a; border-radius:10px; padding:0.85rem 1rem; margin-bottom:1rem;">
							<label for="input-expire-days" style="display:block; font-size:0.82rem; font-weight:700; color:#92400e; margin-bottom:0.4rem;">
								⏱️ Jangka Waktu / Batas Jatuh Tempo ACC (Berapa Hari):
							</label>
							<div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
								<input
									id="input-expire-days"
									type="number"
									name="expire_days"
									min="1"
									max="365"
									value={accExpireDays}
									oninput={(e) => handleExpireDaysChange(Number(e.currentTarget.value))}
									required
									style="width:90px; padding:0.45rem 0.65rem; border:1.5px solid #f59e0b; border-radius:8px; font-size:0.95rem; font-weight:800; color:#92400e; text-align:center; background:#ffffff;"
								/>
								<span style="font-size:0.85rem; font-weight:700; color:#78350f;">Hari</span>
								<div style="display:flex; gap:0.3rem; flex-wrap:wrap; margin-left:0.25rem;">
									{#each [1, 2, 3, 5, 7, 14] as presetDay}
										<button
											type="button"
											onclick={() => handleExpireDaysChange(presetDay)}
											style="padding:0.28rem 0.55rem; border-radius:6px; font-size:0.74rem; font-weight:700; cursor:pointer; border:1px solid {accExpireDays === presetDay ? '#d97706' : '#fcd34d'}; background:{accExpireDays === presetDay ? '#f59e0b' : '#ffffff'}; color:{accExpireDays === presetDay ? '#ffffff' : '#92400e'};"
										>
											{presetDay} Hr
										</button>
									{/each}
								</div>
							</div>
							<div style="font-size:0.74rem; color:#92400e; margin-top:0.45rem; line-height:1.4;">
								📌 Otomatis terset jatuh tempo ACC pada tanggal <strong>{payTargetDate}</strong> (Hitung mundur <strong>{accExpireDays} hari</strong> dalam detik, menit, jam &amp; hari). Jika lewat batas ini belum di-ACC, otomatis dibatalkan dan kembali ke <strong>OS Hutang Aktif</strong>.
							</div>
						</div>
					{/if}

					<!-- Tanggal & Nominal dengan Format Rupiah & Titik -->
					<div class="field-grid">
						<div class="field">
							<label
								>{isBoss
									? "Tanggal Bayar"
									: "Tanggal Batas / Target ACC"}</label
							>
							<input
								type="date"
								name="payment_date"
								value={payTargetDate}
								onchange={(e) => handlePayTargetDateChange(e.currentTarget.value)}
								required
							/>
						</div>
						<div class="field">
							<label
								>{isBoss
									? "Jumlah Dibayar"
									: "Jumlah Diajukan"}</label
							>
							<div class="money-input-wrapper">
								<span class="currency-prefix green">Rp.</span>
								<input
									type="text"
									name="amount_paid"
									bind:value={payAmountFormatted}
									oninput={handlePayAmountInput}
									required
									class="money-input green"
								/>
							</div>
						</div>
					</div>

					{#if payAmountRaw < payDebt.remaining_amount && payAmountRaw > 0}
						<div
							class="field-hint"
							style="background:#fef3c7; padding:0.5rem 0.75rem; border-radius:6px; color:#92400e;"
						>
							💡 Ini cicilan sebagian. Sisa setelah bayar: <strong
								>{rp(
									payDebt.remaining_amount - payAmountRaw,
								)}</strong
							> — tagihan tetap aktif sampai lunas.
						</div>
					{/if}

					<!-- Sumber Kas (default Tunai tanpa opsi dropdown) -->
					<input type="hidden" name="source_fund" value="Tunai" />

					<!-- Catatan opsional -->
					<div class="field">
						<label
							>{isBoss
								? "Catatan Pembayaran"
								: "Catatan / Pesan untuk Atasan"}
							<span style="color:#94a3b8">(opsional)</span></label
						>
						<input
							type="text"
							name="notes"
							placeholder={isBoss
								? "Misal: Pembayaran via Transfer..."
								: "Misal: Mohon di-ACC untuk pelunasan tempo hari ini..."}
						/>
					</div>
				</div>
				<div class="modal-foot">
					<button type="button" class="btn-ghost" onclick={closePay}
						>Batal</button
					>
					<button
						type="submit"
						class="btn-primary"
						style="background:{isBoss
							? '#16a34a'
							: '#2563eb'}; font-weight:700;"
					>
						{isBoss
							? "Konfirmasi Bayar 💵"
							: "Kirim Pengajuan ke Atasan (Minta ACC) 📨"}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ============ MODAL: ACC & SELESAIKAN PEMBAYARAN (ATASAN / ACC BY WA ADMIN) ============ -->
{#if showApproveModal && approveTargetDebt}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal" style="max-width:480px;">
			<div
				class="modal-head"
				style="background:#f0fdf4; border-bottom:1px solid #bbf7d0;"
			>
				<h2
					style="color:#166534; display:flex; align-items:center; gap:0.4rem;"
				>
					<span>✅</span>
					{isWaApproval
						? "Konfirmasi ACC via WhatsApp"
						: "Konfirmasi ACC Pembayaran"}
				</h2>
				<button class="btn-close" onclick={closeApproveModal}>✕</button>
			</div>
			<form
				method="POST"
				action="?pt={data.currentCompany?.code ||
					'ART'}&/approveDebtPayment"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === "success") {
							const wasWa = isWaApproval;
							closeApproveModal();
							notify(
								"success",
								wasWa
									? "ACC via WhatsApp Berhasil! 💬✅"
									: "ACC Berhasil & Lunas! 🎉",
								"Tagihan telah disetujui sesuai tanggal ACC dan otomatis masuk ke menu Sudah Dibayar.",
							);
							if (soundEnabled) sound.playAman();
						}
						await update();
					};
				}}
			>
				<input
					type="hidden"
					name="debt_id"
					value={approveTargetDebt.id}
				/>
				<input
					type="hidden"
					name="approval_method"
					value={isWaApproval ? "whatsapp" : "direct"}
				/>
				<div class="modal-body">
					<div
						class="debt-info-box"
						style="border-left:4px solid #16a34a;"
					>
						<div class="name">{approveTargetDebt.contact_name}</div>
						<div class="desc">{approveTargetDebt.description}</div>
						<div
							style="font-size:0.75rem; color:#64748b; margin-top:0.25rem;"
						>
							No Bon: <strong style="color:#334155;"
								>{approveTargetDebt.invoice_no || "-"}</strong
							>
							• Tgl Nota:
							<strong style="color:#334155;"
								>{approveTargetDebt.invoice_date || "-"}</strong
							>
							• PT:
							<strong style="color:#334155;"
								>{approveTargetDebt.company_code ||
									data.currentCompany?.code}</strong
							>
						</div>
					</div>

					<div
						style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:0.85rem 1rem; margin:1rem 0; display:flex; flex-direction:column; gap:0.55rem;"
					>
						<div
							style="display:flex; justify-content:space-between; font-size:0.82rem; color:#64748b;"
						>
							<span>Nominal Disetujui (ACC):</span>
							<strong style="color:#16a34a; font-size:1.05rem;"
								>{rp(
									approveTargetDebt.pending_amount ||
										approveTargetDebt.remaining_amount,
								)}</strong
							>
						</div>
						<div
							style="display:flex; justify-content:space-between; font-size:0.78rem; color:#64748b;"
						>
							<span>Tanggal Nota / Bon:</span>
							<strong style="color:#334155;"
								>{approveTargetDebt.invoice_date || "-"}</strong
							>
						</div>
						<div
							style="display:flex; justify-content:space-between; font-size:0.78rem; color:#64748b;"
						>
							<span>Diajukan Oleh:</span>
							<strong style="color:#334155;"
								>{approveTargetDebt.pending_by ||
									"Petugas Keuangan"} (Tgl Ajuan: {approveTargetDebt.pending_payment_date ||
									"-"})</strong
							>
						</div>
						{#if approveTargetDebt.pending_notes}
							<div
								style="margin-top:0.25rem; padding-top:0.35rem; border-top:1px dashed #cbd5e1; font-size:0.75rem; color:#475569;"
							>
								<em>"{approveTargetDebt.pending_notes}"</em>
							</div>
						{/if}
					</div>

					<!-- Tanggal Resmi ACC / Pembayaran (mengikuti tanggal saat di-ACC, bukan tanggal menunggu ACC) -->
					<div class="field" style="margin-bottom:0.85rem;">
						<label
							for="approve-payment-date"
							style="font-size:0.82rem; font-weight:700; color:#1e293b; display:block; margin-bottom:0.3rem;"
						>
							📅 Tanggal ACC / Tanggal Bayar (Tercatat di Sudah
							Dibayar)
						</label>
						<input
							id="approve-payment-date"
							type="date"
							name="payment_date"
							bind:value={approvePaymentDate}
							required
							style="width:100%; padding:0.55rem 0.75rem; border:1.5px solid #86efac; border-radius:8px; font-size:0.9rem; font-weight:700; color:#166534; background:#f0fdf4;"
						/>
						<div
							style="font-size:0.72rem; color:#64748b; margin-top:0.2rem;"
						>
							* Otomatis mengikuti tanggal hari ini saat di-ACC
							(bukan tanggal saat pengajuan).
						</div>
					</div>

					{#if isWaApproval}
						<div class="field" style="margin-bottom:0.85rem;">
							<label
								for="wa-approver-select"
								style="font-size:0.82rem; font-weight:700; color:#1e293b; display:block; margin-bottom:0.3rem;"
							>
								💬 Dikonfirmasi via WhatsApp Oleh:
							</label>
							<select
								id="wa-approver-select"
								name="wa_approver"
								bind:value={waApproverName}
								style="width:100%; padding:0.55rem 0.75rem; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.88rem; font-weight:600; color:#0f172a; background:#ffffff;"
							>
								<option value="Pak Danny / Pak Carmen"
									>Pak Danny / Pak Carmen (via WhatsApp)</option
								>
								<option value="Pak Danny"
									>Pak Danny (via WhatsApp)</option
								>
								<option value="Pak Carmen"
									>Pak Carmen (via WhatsApp)</option
								>
							</select>
						</div>
					{/if}

					<div
						style="font-size:0.8rem; color:#475569; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:0.6rem 0.8rem;"
					>
						💡 Dengan menekan tombol di bawah, pengeluaran sebesar <strong
							style="color:#166534;"
							>{rp(
								approveTargetDebt.pending_amount ||
									approveTargetDebt.remaining_amount,
							)}</strong
						>
						akan resmi dicatat pada tanggal
						<strong style="color:#166534;"
							>{approvePaymentDate}</strong
						>
						di menu <strong>Sudah Dibayar</strong>.
					</div>
				</div>
				<div class="modal-foot">
					<button
						type="button"
						class="btn-ghost"
						onclick={closeApproveModal}>Batal</button
					>
					<button
						type="submit"
						class="btn-primary"
						style="background:#16a34a; font-weight:700;"
					>
						{isWaApproval
							? "✅ Konfirmasi ACC via WhatsApp"
							: "Ya, ACC & Bayar Sekarang ✨"}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ============ MODAL: TOLAK ACC PEMBAYARAN (KHUSUS ATASAN) ============ -->
{#if showRejectModal && rejectTargetDebt}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal" style="max-width:460px;">
			<div
				class="modal-head"
				style="background:#fef2f2; border-bottom:1px solid #fecaca;"
			>
				<h2
					style="color:#b91c1c; display:flex; align-items:center; gap:0.4rem;"
				>
					<span>❌</span> Tolak Pengajuan Pembayaran
				</h2>
				<button class="btn-close" onclick={closeRejectModal}>✕</button>
			</div>
			<form
				method="POST"
				action="?pt={data.currentCompany?.code ||
					'ART'}&/rejectDebtApproval"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === "success") {
							closeRejectModal();
							notify(
								"warning",
								"Pengajuan Ditolak",
								"Tagihan telah dikembalikan ke menu OS Hutang Aktif.",
							);
							if (soundEnabled) sound.playPerhatian();
						}
						await update();
					};
				}}
			>
				<input
					type="hidden"
					name="debt_id"
					value={rejectTargetDebt.id}
				/>
				<div class="modal-body">
					<div
						class="debt-info-box"
						style="border-left:4px solid #ef4444;"
					>
						<div class="name">{rejectTargetDebt.contact_name}</div>
						<div class="desc">{rejectTargetDebt.description}</div>
						<div
							style="font-size:0.75rem; color:#64748b; margin-top:0.25rem;"
						>
							Nominal Diajukan: <strong style="color:#b91c1c;"
								>{rp(
									rejectTargetDebt.pending_amount ||
										rejectTargetDebt.remaining_amount,
								)}</strong
							>
						</div>
					</div>

					<div class="field" style="margin-top:1rem;">
						<label
							for="reject-reason"
							style="font-size:0.85rem; font-weight:700; color:#1e293b; display:block; margin-bottom:0.35rem;"
						>
							Alasan Penolakan / Catatan untuk Staff:
						</label>
						<textarea
							id="reject-reason"
							name="reason"
							bind:value={rejectReason}
							rows="3"
							placeholder="Misal: Tunda dulu sampai minggu depan, nominal cek ulang dengan nota toko..."
							style="width:100%; padding:0.6rem; border:1px solid #cbd5e1; border-radius:8px; font-size:0.85rem; resize:vertical; font-family:inherit;"
						></textarea>
					</div>

					<div
						style="font-size:0.78rem; color:#64748b; margin-top:0.6rem;"
					>
						ℹ️ Tagihan ini akan dikeluarkan dari antrean ACC dan
						dikembalikan ke menu <strong>OS Hutang Aktif</strong> dengan
						status belum lunas.
					</div>
				</div>
				<div class="modal-foot">
					<button
						type="button"
						class="btn-ghost"
						onclick={closeRejectModal}>Batal</button
					>
					<button
						type="submit"
						class="btn-primary"
						style="background:#dc2626; font-weight:700;"
					>
						Tolak & Kembalikan ke OS Hutang
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* Money input wrapper dengan prefix Rp. dan titik pemisah */
	.money-input-wrapper {
		display: flex;
		align-items: center;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		background: #ffffff;
		overflow: hidden;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.money-input-wrapper:focus-within {
		border-color: #f43f5e;
		box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.18);
	}
	.currency-prefix {
		padding: 0.55rem 0.65rem 0.55rem 0.85rem;
		font-size: 0.95rem;
		font-weight: 700;
		color: #64748b;
		background: #f8fafc;
		border-right: 1px solid #e2e8f0;
		user-select: none;
	}
	.currency-prefix.green {
		color: #16a34a;
		background: #f0fdf4;
		border-right-color: #bbf7d0;
	}
	.money-input {
		border: none !important;
		outline: none !important;
		box-shadow: none !important;
		padding: 0.55rem 0.85rem !important;
		font-size: 1.05rem !important;
		font-weight: 700 !important;
		color: #0f172a !important;
		width: 100% !important;
	}
	.money-input.green {
		color: #16a34a !important;
	}
	/* Tombol Detail Bon */
	/* Sort Select & Sortable Table Header */
	.sort-select {
		padding: 0.45rem 0.75rem;
		border: 1.5px solid #cbd5e1;
		border-radius: 8px;
		font-size: 0.84rem;
		font-weight: 600;
		color: #1e293b;
		background: #ffffff;
		cursor: pointer;
		outline: none;
		transition: all 0.15s;
	}
	.sort-select:hover {
		border-color: #94a3b8;
	}
	.sort-select:focus {
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
	}
	:global([data-theme="dark"]) .sort-select {
		background: #1e293b;
		color: #f1f5f9;
		border-color: #334155;
	}
	.sortable-th {
		cursor: pointer;
		user-select: none;
		transition:
			background 0.15s,
			color 0.15s;
	}
	.sortable-th:hover {
		background: #e2e8f0 !important;
		color: #0f172a !important;
	}
	:global([data-theme="dark"]) .sortable-th:hover {
		background: #334155 !important;
		color: #ffffff !important;
	}
	.sort-badge {
		display: inline-block;
		font-size: 0.68rem;
		font-weight: 700;
		background: #e2e8f0;
		color: #334155;
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
		margin-left: 0.25rem;
		vertical-align: middle;
	}
	:global([data-theme="dark"]) .sort-badge {
		background: #334155;
		color: #cbd5e1;
	}

	/* Tombol Edit Tagihan */
	.btn-edit {
		background: #eff6ff;
		color: #1d4ed8;
		border: 1px solid #bfdbfe;
		padding: 0.32rem 0.65rem;
		border-radius: 6px;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.btn-edit:hover {
		background: #dbeafe;
		color: #1e40af;
		border-color: #93c5fd;
	}
	:global([data-theme="dark"]) .btn-edit {
		background: #1e293b;
		color: #60a5fa;
		border-color: #3b82f6;
	}
	:global([data-theme="dark"]) .btn-edit:hover {
		background: #2563eb;
		color: #ffffff;
	}

	.btn-detail {
		background: #f1f5f9;
		color: #334155;
		border: 1px solid #cbd5e1;
		padding: 0.32rem 0.65rem;
		border-radius: 6px;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.btn-detail:hover {
		background: #e2e8f0;
		color: #0f172a;
		border-color: #94a3b8;
	}

	/* KERTAS SLIP BON */
	.bon-card {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.75rem 2rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
		font-family: inherit;
		color: #0f172a;
	}

	.bon-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.bon-company {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.bon-company-logo {
		width: 44px;
		height: 44px;
		background: linear-gradient(135deg, #f43f5e 0%, #ec4899 100%);
		color: #ffffff;
		font-weight: 800;
		font-size: 1.1rem;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		letter-spacing: 0.5px;
	}

	.bon-company-name {
		font-size: 1.05rem;
		font-weight: 800;
		color: #0f172a;
		letter-spacing: -0.2px;
	}

	.bon-company-sub {
		font-size: 0.75rem;
		color: #64748b;
	}

	.bon-status-wrap {
		display: flex;
		align-items: center;
	}

	.bon-stamp {
		font-size: 0.85rem;
		font-weight: 800;
		padding: 0.4rem 0.85rem;
		border-radius: 6px;
		letter-spacing: 0.5px;
		border: 2px solid transparent;
		text-transform: uppercase;
	}

	.stamp-paid {
		background: #f0fdf4;
		color: #166534;
		border-color: #86efac;
	}

	.stamp-partial {
		background: #fefce8;
		color: #854d0e;
		border-color: #fde047;
	}

	.stamp-overdue {
		background: #fef2f2;
		color: #991b1b;
		border-color: #fca5a5;
	}

	.stamp-unpaid {
		background: #f1f5f9;
		color: #334155;
		border-color: #cbd5e1;
	}

	.bon-divider {
		border-bottom: 2px dashed #cbd5e1;
		margin: 1.25rem 0 1rem 0;
	}

	.bon-title-section {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		margin-bottom: 1.25rem;
	}

	.bon-title {
		font-size: 1.15rem;
		font-weight: 800;
		color: #0f172a;
		letter-spacing: 0.5px;
	}

	.bon-no {
		font-size: 0.85rem;
		color: #475569;
	}

	.bon-meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		background: #f8fafc;
		border: 1px solid #f1f5f9;
		border-radius: 8px;
		padding: 1rem 1.25rem;
		margin-bottom: 1.25rem;
	}

	.bon-meta-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		font-weight: 700;
		color: #64748b;
		display: block;
		margin-bottom: 0.2rem;
	}

	.bon-meta-val {
		font-size: 0.9rem;
		color: #1e293b;
	}

	.bon-items-table-wrap {
		margin-bottom: 1.25rem;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		overflow: hidden;
	}

	.bon-items-table {
		width: 100%;
		border-collapse: collapse;
	}

	.bon-items-table th {
		background: #f1f5f9;
		padding: 0.65rem 0.85rem;
		font-size: 0.75rem;
		font-weight: 700;
		color: #475569;
		text-transform: uppercase;
		border-bottom: 1px solid #e2e8f0;
	}

	.bon-items-table td {
		padding: 0.85rem 0.85rem;
		font-size: 0.85rem;
		border-bottom: 1px solid #f1f5f9;
	}

	.bon-summary-grid {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
		align-items: start;
	}

	.bon-note-label {
		font-size: 0.75rem;
		font-weight: 700;
		color: #475569;
		margin-bottom: 0.25rem;
	}

	.bon-note-text {
		font-size: 0.75rem;
		color: #64748b;
		line-height: 1.4;
	}

	.bon-summary-right {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		padding: 0.85rem 1rem;
	}

	.bon-calc-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		margin-bottom: 0.4rem;
		color: #475569;
	}

	.bon-calc-row.total-row {
		border-top: 1px dashed #cbd5e1;
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		font-weight: 800;
	}

	.bon-payments-section {
		margin-bottom: 1.5rem;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 8px;
		padding: 0.85rem 1rem;
	}

	.bon-payments-title {
		font-size: 0.8rem;
		font-weight: 700;
		color: #166534;
		margin-bottom: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.bon-payments-table {
		width: 100%;
		border-collapse: collapse;
	}

	.bon-payments-table th {
		font-size: 0.7rem;
		font-weight: 700;
		color: #166534;
		text-align: left;
		padding: 0.35rem 0.5rem;
		border-bottom: 1px solid #bbf7d0;
	}

	.bon-payments-table td {
		font-size: 0.78rem;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid #dcfce7;
	}

	.bon-signatures {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 1.25rem;
		margin-top: 1.75rem;
		padding-top: 1rem;
		border-top: 1px dashed #cbd5e1;
		text-align: center;
	}

	.bon-sign-role {
		font-size: 0.75rem;
		font-weight: 700;
		color: #475569;
	}

	.bon-sign-space {
		height: 48px;
	}

	.bon-sign-line {
		font-size: 0.75rem;
		color: #64748b;
		border-top: 1px solid #cbd5e1;
		padding-top: 0.25rem;
		display: inline-block;
		width: 90%;
	}

	/* MEDIA PRINT */
	@media print {
		:global(body *) {
			visibility: hidden;
		}
		:global(.modal-detail-bon),
		:global(.modal-detail-bon *) {
			visibility: visible;
		}
		:global(.modal-overlay) {
			position: absolute !important;
			inset: 0 !important;
			background: transparent !important;
			backdrop-filter: none !important;
			display: block !important;
		}
		:global(.modal-detail-bon) {
			position: absolute !important;
			left: 0 !important;
			top: 0 !important;
			width: 100% !important;
			max-width: 100% !important;
			box-shadow: none !important;
			border: none !important;
			margin: 0 !important;
			padding: 0 !important;
		}
		:global(.modal-body) {
			padding: 0 !important;
			background: transparent !important;
			max-height: none !important;
			overflow: visible !important;
		}
		:global(.bon-card) {
			box-shadow: none !important;
			border: 1px solid #000 !important;
			border-radius: 0 !important;
			padding: 1.5cm !important;
		}
		:global(.no-print) {
			display: none !important;
		}
	}
	/* Total Harus Dibayar Badge */
	.debt-total-badge {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		background: #fef2f2;
		border: 1px solid #fecaca;
		padding: 0.35rem 0.85rem;
		border-radius: 8px;
		user-select: none;
	}
	.debt-total-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		font-weight: 700;
		color: #991b1b;
		letter-spacing: 0.3px;
	}
	.debt-total-amount {
		font-size: 1.08rem;
		font-weight: 800;
		color: #b91c1c;
		line-height: 1.2;
	}

	/* Tombol Export Excel & PDF */
	.export-btn-group {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.btn-export-excel {
		background: #f0fdf4;
		color: #166534;
		border: 1px solid #bbf7d0;
		padding: 0.42rem 0.75rem;
		border-radius: 7px;
		font-size: 0.8rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-export-excel:hover {
		background: #16a34a;
		color: #ffffff;
		border-color: #16a34a;
	}
	.btn-export-pdf {
		background: #fef2f2;
		color: #991b1b;
		border: 1px solid #fecaca;
		padding: 0.42rem 0.75rem;
		border-radius: 7px;
		font-size: 0.8rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-export-pdf:hover {
		background: #dc2626;
		color: #ffffff;
		border-color: #dc2626;
	}
	/* TOAST CONTAINER & CARDS */
	.toast-container {
		position: fixed;
		top: 1.25rem;
		right: 1.5rem;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		max-width: 380px;
		width: calc(100% - 3rem);
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		border-radius: 10px;
		background: #ffffff;
		box-shadow:
			0 10px 25px -5px rgba(0, 0, 0, 0.1),
			0 8px 10px -6px rgba(0, 0, 0, 0.05);
		border: 1px solid #e2e8f0;
		animation: slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
		transition: all 0.2s ease;
	}

	@keyframes slideInRight {
		from {
			opacity: 0;
			transform: translateX(30px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.toast-icon {
		font-size: 1.25rem;
		line-height: 1;
		flex-shrink: 0;
	}

	.toast-content {
		flex: 1;
	}

	.toast-title {
		font-size: 0.85rem;
		font-weight: 700;
		color: #0f172a;
		margin-bottom: 0.15rem;
	}

	.toast-message {
		font-size: 0.78rem;
		color: #475569;
		line-height: 1.35;
	}

	.toast-close {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 0.85rem;
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
	}

	.toast-close:hover {
		color: #0f172a;
	}

	.toast-success {
		border-left: 5px solid #16a34a;
		background: #f0fdf4;
	}

	.toast-warning {
		border-left: 5px solid #f59e0b;
		background: #fffbeb;
	}

	.toast-danger {
		border-left: 5px solid #dc2626;
		background: #fef2f2;
	}

	.toast-info {
		border-left: 5px solid #0284c7;
		background: #f0f9ff;
	}

	/* TOMBOL SAKLAR SUARA */
	.btn-sound-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.45rem 0.75rem;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 700;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #1e293b;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-sound-toggle:hover {
		background: #f8fafc;
		border-color: #94a3b8;
	}

	.btn-sound-toggle.muted {
		background: #f1f5f9;
		color: #64748b;
		border-color: #e2e8f0;
	}

	/* LONCENG NOTIFIKASI */
	.notif-bell-container {
		position: relative;
	}

	.btn-bell {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 8px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		font-size: 1.1rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-bell:hover {
		background: #f8fafc;
		border-color: #94a3b8;
	}

	.btn-bell.has-urgent {
		border-color: #fca5a5;
		background: #fef2f2;
	}

	.bell-badge {
		position: absolute;
		top: -4px;
		right: -4px;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		border-radius: 9px;
		font-size: 0.65rem;
		font-weight: 800;
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid #ffffff;
	}

	.bell-badge.danger {
		background: #dc2626;
		animation: pulse 1.5s infinite;
	}

	.bell-badge.warning {
		background: #f59e0b;
	}

	@keyframes pulse {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.15);
		}
	}

	/* DROPDOWN NOTIFIKASI */
	.notif-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 360px;
		max-width: calc(100vw - 2rem);
		background: #ffffff;
		border-radius: 12px;
		border: 1px solid #cbd5e1;
		box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		overflow: hidden;
		animation: fadeInDown 0.18s ease-out;
	}

	@keyframes fadeInDown {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.notif-drop-head {
		padding: 0.75rem 1rem;
		background: #f8fafc;
		border-bottom: 1px solid #e2e8f0;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.notif-close-btn {
		background: transparent;
		border: none;
		color: #64748b;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.notif-sound-test-box {
		padding: 0.65rem 1rem;
		background: #f1f5f9;
		border-bottom: 1px solid #e2e8f0;
	}

	.notif-sound-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: #475569;
		text-transform: uppercase;
		margin-bottom: 0.35rem;
	}

	.notif-sound-btns {
		display: flex;
		gap: 0.4rem;
	}

	.btn-test-sound {
		flex: 1;
		padding: 0.3rem 0.4rem;
		border-radius: 6px;
		font-size: 0.72rem;
		font-weight: 700;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-test-sound:hover {
		transform: translateY(-1px);
	}

	.sound-green:hover {
		background: #f0fdf4;
		border-color: #86efac;
		color: #166534;
	}
	.sound-yellow:hover {
		background: #fefce8;
		border-color: #fde047;
		color: #854d0e;
	}
	.sound-red:hover {
		background: #fef2f2;
		border-color: #fca5a5;
		color: #991b1b;
	}

	.notif-drop-body {
		max-height: 380px;
		overflow-y: auto;
		padding: 0.75rem 1rem;
	}

	.notif-section-title {
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.5px;
		margin-bottom: 0.4rem;
	}

	.notif-section-title.danger {
		color: #b91c1c;
	}

	.notif-section-title.warning {
		color: #b45309;
	}

	.notif-item {
		padding: 0.6rem 0.75rem;
		border-radius: 8px;
		margin-bottom: 0.5rem;
		border: 1px solid #e2e8f0;
		background: #ffffff;
	}

	.notif-item.overdue {
		border-color: #fecaca;
		background: #fff5f5;
	}

	.notif-item.h5 {
		border-color: #fed7aa;
		background: #fffaf0;
	}

	.notif-item-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.2rem;
		font-size: 0.82rem;
	}

	.notif-days-tag {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
	}

	.notif-days-tag.danger {
		background: #fee2e2;
		color: #991b1b;
	}

	.notif-days-tag.warning {
		background: #ffedd5;
		color: #9a3412;
	}

	.notif-item-desc {
		font-size: 0.75rem;
		color: #475569;
		margin-bottom: 0.35rem;
		line-height: 1.3;
	}

	.notif-item-foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.notif-amount {
		font-size: 0.85rem;
		font-weight: 800;
		color: #0f172a;
	}

	.btn-pay-quick {
		background: #16a34a;
		color: #ffffff;
		border: none;
		border-radius: 5px;
		padding: 0.25rem 0.6rem;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-pay-quick:hover {
		background: #15803d;
	}

	.notif-empty {
		text-align: center;
		padding: 1.5rem 1rem;
	}
	/* THEME TOGGLE DI TOPBAR */
	.btn-theme-nav {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.45rem 0.75rem;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 700;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #1e293b;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-theme-nav:hover {
		background: #f8fafc;
		border-color: #94a3b8;
		transform: translateY(-1px);
	}

	:global([data-theme="dark"]) .btn-theme-nav {
		background: #1e293b;
		border-color: #334155;
		color: #f8fafc;
	}

	:global([data-theme="dark"]) .btn-theme-nav:hover {
		background: #334155;
	}

	/* LOGOUT BUTTON DI SIDEBAR */
	.btn-logout {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.45rem 0.75rem;
		border-radius: 7px;
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #fca5a5;
		font-size: 0.75rem;
		font-weight: 700;
		text-decoration: none;
		transition: all 0.15s ease;
	}

	.btn-logout:hover {
		background: rgba(239, 68, 68, 0.3);
		color: #ffffff;
		border-color: #ef4444;
	}

	/* ==========================================================================
	   GAYA FILTER BULAN / TAHUN / TANGGAL & KARTU REKAPAN 2 PT MULTI-COMPANY
	   ========================================================================== */
	.period-filter-card {
		background: #ffffff;
		border: 1px solid #fbcfe8;
		border-radius: 14px;
		padding: 1.1rem 1.35rem;
		margin-bottom: 1.1rem;
		box-shadow: 0 2px 10px rgba(244, 63, 94, 0.05);
		transition: all 0.2s ease;
	}
	:global(.dark) .period-filter-card {
		background: #1e1528;
		border-color: #3b224c;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
	}

	.filter-top-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.85rem;
		padding-bottom: 0.85rem;
		border-bottom: 1px solid #fdf2f8;
	}
	:global(.dark) .filter-top-row {
		border-bottom-color: #2e1c3b;
	}

	.filter-header-title {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}
	.filter-icon {
		font-size: 1.4rem;
	}
	.filter-heading {
		font-size: 0.95rem;
		font-weight: 800;
		color: #1e0927;
		letter-spacing: -0.2px;
	}
	:global(.dark) .filter-heading {
		color: #fce7f3;
	}
	.filter-active-tag {
		font-size: 0.78rem;
		color: #7c4d7e;
		margin-top: 0.15rem;
	}
	:global(.dark) .filter-active-tag {
		color: #d8b4fe;
	}

	/* Pills PT Switcher */
	.pt-filter-pills {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: #fdf2f8;
		padding: 0.25rem 0.3rem;
		border-radius: 999px;
		border: 1px solid #fce7f3;
	}
	:global(.dark) .pt-filter-pills {
		background: #170d20;
		border-color: #351a44;
	}
	.pt-pill {
		border: none;
		background: transparent;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.32rem 0.75rem;
		border-radius: 999px;
		color: #64748b;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.pt-pill:hover {
		color: #1e0927;
	}
	:global(.dark) .pt-pill:hover {
		color: #fdf2f8;
	}
	.pt-pill.active {
		background: #ffffff;
		color: #0f172a;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
	}
	:global(.dark) .pt-pill.active {
		background: #2b1739;
		color: #ffffff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
	}
	.pt-pill.pill-art.active {
		background: #0284c7;
		color: #ffffff;
	}
	.pt-pill.pill-knm.active {
		background: #8b5cf6;
		color: #ffffff;
	}

	.badge-pt-pill {
		display: inline-block;
		padding: 0.1rem 0.45rem;
		border-radius: 4px;
		font-size: 0.72rem;
		font-weight: 700;
	}
	.badge-pt-pill.combined {
		background: #fef08a;
		color: #854d0e;
	}
	.badge-pt-pill.art {
		background: #e0f2fe;
		color: #0369a1;
	}
	.badge-pt-pill.knm {
		background: #ede9fe;
		color: #6d28d9;
	}

	.badge-pt-inline {
		font-size: 0.68rem;
		font-weight: 800;
		padding: 0.12rem 0.45rem;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}
	.badge-pt-inline.art {
		background: #e0f2fe;
		color: #0284c7;
		border: 1px solid #bae6fd;
	}
	.badge-pt-inline.knm {
		background: #ede9fe;
		color: #7c3aed;
		border: 1px solid #ddd6fe;
	}

	/* ================= MODERN FILTER BOX (5 TOMBOL UTAMA) ================= */
	.modern-filter-box {
		background: #ffffff;
		border: 1px solid #fce7f3;
		border-radius: 16px;
		padding: 1rem 1.25rem;
		margin-bottom: 1.15rem;
		box-shadow:
			0 4px 20px -4px rgba(244, 63, 94, 0.06),
			0 2px 6px -2px rgba(0, 0, 0, 0.03);
		transition: all 0.25s ease;
	}
	:global(.dark) .modern-filter-box {
		background: #190e24;
		border-color: #38194e;
		box-shadow: 0 4px 20px -4px rgba(0, 0, 0, 0.4);
	}

	.modern-filter-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.filter-header-left {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.modern-filter-icon {
		font-size: 1.85rem;
		line-height: 1;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.06));
	}

	.modern-filter-meta {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.filter-main-title {
		font-size: 0.98rem;
		font-weight: 800;
		color: #0f172a;
		letter-spacing: -0.2px;
	}
	:global(.dark) .filter-main-title {
		color: #f8fafc;
	}

	.filter-status-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.78rem;
		flex-wrap: wrap;
	}

	.period-status-label {
		color: #64748b;
		font-weight: 500;
	}
	:global(.dark) .period-status-label {
		color: #94a3b8;
	}

	.badge-active-period {
		color: #be185d;
		font-weight: 800;
		background: #fdf2f8;
		padding: 0.15rem 0.55rem;
		border-radius: 999px;
		border: 1px solid #fbcfe8;
	}
	:global(.dark) .badge-active-period {
		background: #31113b;
		color: #f472b6;
		border-color: #551e66;
	}

	.meta-separator {
		color: #cbd5e1;
	}

	/* Cluster 5 Tombol Filter */
	.filter-buttons-cluster {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: #f8fafc;
		padding: 0.3rem;
		border-radius: 12px;
		border: 1px solid #e2e8f0;
		flex-wrap: wrap;
	}
	:global(.dark) .filter-buttons-cluster {
		background: #12081d;
		border-color: #2e1540;
	}

	.modern-filter-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.45rem 0.8rem;
		border-radius: 9px;
		border: 1px solid transparent;
		background: transparent;
		color: #475569;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		white-space: nowrap;
	}
	:global(.dark) .modern-filter-btn {
		color: #94a3b8;
	}

	.modern-filter-btn:hover {
		background: #ffffff;
		color: #e11d48;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
	}
	:global(.dark) .modern-filter-btn:hover {
		background: #230f36;
		color: #f472b6;
	}

	.modern-filter-btn.active {
		background: #ffffff;
		color: #be185d;
		border-color: #fbcfe8;
		box-shadow: 0 3px 10px rgba(244, 63, 94, 0.15);
	}
	:global(.dark) .modern-filter-btn.active {
		background: #321245;
		color: #f472b6;
		border-color: #ec4899;
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
	}

	.btn-all-filter.active {
		color: #059669;
		border-color: #a7f3d0;
	}
	:global(.dark) .btn-all-filter.active {
		color: #34d399;
		border-color: #059669;
	}

	.btn-custom-filter {
		background: rgba(241, 245, 249, 0.8);
		border-color: #e2e8f0;
	}
	:global(.dark) .btn-custom-filter {
		background: rgba(30, 16, 45, 0.8);
		border-color: #3d2350;
	}

	.caret-indicator {
		font-size: 0.62rem;
		opacity: 0.7;
	}

	/* Dropdown Drawer Kustom */
	.custom-filter-dropdown {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px dashed #fce7f3;
		animation: slideDown 0.2s ease;
	}
	:global(.dark) .custom-filter-dropdown {
		border-top-color: #38194e;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.custom-tab-strip {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 0.85rem;
		flex-wrap: wrap;
	}

	.custom-tab-pill {
		padding: 0.35rem 0.7rem;
		border-radius: 8px;
		border: 1px solid #e2e8f0;
		background: #f8fafc;
		font-size: 0.74rem;
		font-weight: 600;
		color: #475569;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	:global(.dark) .custom-tab-pill {
		background: #180b26;
		border-color: #34154b;
		color: #cbd5e1;
	}
	.custom-tab-pill.active {
		background: #ec4899;
		color: #ffffff;
		border-color: #ec4899;
	}

	.custom-controls-body {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		flex-wrap: wrap;
	}

	.custom-field-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		font-weight: 600;
		color: #475569;
	}
	:global(.dark) .custom-field-group {
		color: #cbd5e1;
	}

	.custom-select-box,
	.custom-input-box {
		padding: 0.4rem 0.7rem;
		border-radius: 8px;
		border: 1.5px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		font-size: 0.8rem;
		font-weight: 600;
		outline: none;
	}
	:global(.dark) .custom-select-box,
	:global(.dark) .custom-input-box {
		background: #12081d;
		border-color: #38194e;
		color: #f8fafc;
	}

	.btn-close-custom-panel {
		margin-left: auto;
		padding: 0.4rem 0.85rem;
		border-radius: 8px;
		background: #f1f5f9;
		border: 1px solid #cbd5e1;
		color: #475569;
		font-size: 0.76rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	:global(.dark) .btn-close-custom-panel {
		background: #251038;
		border-color: #451b66;
		color: #cbd5e1;
	}
	.btn-close-custom-panel:hover {
		background: #e2e8f0;
	}

	/* ================= KARTU REKAPAN TOTAL 2 PT ================= */
	.pt-summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 0.9rem;
		margin-bottom: 1.15rem;
	}
	.pt-summary-card {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 1rem 1.25rem;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		position: relative;
		outline: none;
	}
	:global(.dark) .pt-summary-card {
		background: #1e1528;
		border-color: #3b224c;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}
	.pt-summary-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
	}
	.pt-summary-card.card-art {
		border-top: 4px solid #0284c7;
	}
	.pt-summary-card.card-knm {
		border-top: 4px solid #8b5cf6;
	}
	.pt-summary-card.card-combined {
		border-top: 4px solid #10b981;
		background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
	}
	:global(.dark) .pt-summary-card.card-combined {
		background: linear-gradient(180deg, #13241d 0%, #1e1528 100%);
	}

	.pt-summary-card.highlight {
		border-color: #f43f5e;
		box-shadow: 0 0 0 2px rgba(244, 63, 94, 0.3);
	}

	.card-pt-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.pt-tag {
		font-size: 0.72rem;
		font-weight: 800;
		padding: 0.2rem 0.55rem;
		border-radius: 5px;
		letter-spacing: 0.4px;
	}
	.pt-tag.tag-art {
		background: #e0f2fe;
		color: #0284c7;
	}
	.pt-tag.tag-knm {
		background: #ede9fe;
		color: #7c3aed;
	}
	.pt-tag.tag-combined {
		background: #dcfce7;
		color: #15803d;
	}
	.pt-fullname {
		font-size: 0.75rem;
		color: #64748b;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 170px;
	}
	:global(.dark) .pt-fullname {
		color: #94a3b8;
	}

	.card-pt-amount {
		font-size: 1.55rem;
		font-weight: 800;
		color: #dc2626;
		letter-spacing: -0.5px;
		margin: 0.2rem 0 0.4rem 0;
	}
	.card-pt-amount.green {
		color: #15803d;
	}
	.card-pt-amount.combined {
		color: #0f172a;
	}
	:global(.dark) .card-pt-amount.combined {
		color: #f8fafc;
	}

	.card-pt-foot {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.76rem;
		color: #64748b;
		border-top: 1px solid #f1f5f9;
		padding-top: 0.45rem;
		margin-top: 0.35rem;
	}
	:global(.dark) .card-pt-foot {
		border-top-color: #2b183a;
		color: #94a3b8;
	}
	.card-action-hint {
		font-size: 0.72rem;
		font-weight: 700;
		color: #f43f5e;
	}

	.single-pt-grid {
		display: grid;
		grid-template-columns: 1fr;
		margin-bottom: 1.25rem;
	}
	.single-company-card {
		padding: 1.25rem 1.5rem;
		border-radius: 14px;
		background: #ffffff;
		box-shadow:
			0 4px 15px -3px rgba(0, 0, 0, 0.05),
			0 2px 6px -2px rgba(0, 0, 0, 0.03);
	}
	.card-period-pill {
		font-size: 0.8rem;
		font-weight: 700;
		color: #475569;
		background: #f1f5f9;
		padding: 0.3rem 0.75rem;
		border-radius: 9999px;
		border: 1px solid #e2e8f0;
	}
</style>
