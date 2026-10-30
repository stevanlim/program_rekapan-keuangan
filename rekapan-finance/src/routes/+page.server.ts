import type { PageServerLoad, Actions } from './$types';
import { getDb } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';
import { getSessionUser } from '$lib/server/auth';

export const load: PageServerLoad = async ({ url, cookies }) => {
	// Proteksi rute login: Cek sesi di cookie
	const sessionId = cookies.get('finance_session');
	if (!sessionId) {
		redirect(303, '/login');
	}
	const currentUser = await getSessionUser(sessionId);
	if (!currentUser) {
		cookies.delete('finance_session', { path: '/' });
		redirect(303, '/login');
	}

	const db = await getDb();
	const companyCode = url.searchParams.get('pt') || 'ART';

	const [companies]: any = await db.query('SELECT id, code, name FROM companies ORDER BY id');
	const currentCompany = companies.find((c: any) => c.code === companyCode) || companies[0];

	if (!currentCompany) return { companies: [], currentCompany: null, allActiveDebts: [], allPaidDebts: [], allDailyBalances: [], allPayments: [], activeDebts: [], paidDebts: [], payments: [], dailyBalances: [], latestBalancesSummary: [], contacts: [], aging: { b0_30: 0, b31_60: 0, b61_90: 0, b91_120: 0, b_over120: 0, total: 0 } };

	// Query semua hutang aktif (belum lunas dan tidak sedang menunggu persetujuan) dari SEMUA perusahaan
	const [activeRows]: any = await db.query(`
		SELECT
			d.id, d.company_id, d.contact_id,
			comp.code AS company_code, comp.name AS company_name,
			c.name AS contact_name, c.type AS contact_type,
			d.invoice_no,
			DATE_FORMAT(d.invoice_date,'%Y-%m-%d') AS invoice_date,
			DATE_FORMAT(d.due_date,'%Y-%m-%d') AS due_date,
			DATE_FORMAT(COALESCE(d.due_date, DATE_ADD(d.invoice_date, INTERVAL 30 DAY)),'%Y-%m-%d') AS effective_due_date,
			d.amount, d.paid_amount,
			(d.amount - d.paid_amount) AS remaining_amount,
			d.description, d.status,
			d.pending_amount,
			DATE_FORMAT(d.pending_payment_date,'%Y-%m-%d') AS pending_payment_date,
			d.pending_source_fund,
			d.pending_notes,
			d.pending_by,
			d.approved_by,
			DATE_FORMAT(d.approved_at,'%Y-%m-%d %H:%i') AS approved_at,
			d.rejected_notes,
			DATEDIFF(CURRENT_DATE(), d.invoice_date) AS days_overdue,
			DATEDIFF(COALESCE(d.due_date, DATE_ADD(d.invoice_date, INTERVAL 30 DAY)), CURRENT_DATE()) AS days_until_due
		FROM debts d
		JOIN contacts c ON d.contact_id = c.id
		JOIN companies comp ON d.company_id = comp.id
		WHERE d.status IN ('unpaid', 'partially_paid')
		ORDER BY d.invoice_date DESC
	`);

	// Query hutang yang sedang MENUNGGU ACC ATASAN dari SEMUA perusahaan
	const [pendingRows]: any = await db.query(`
		SELECT
			d.id, d.company_id, d.contact_id,
			comp.code AS company_code, comp.name AS company_name,
			c.name AS contact_name, c.type AS contact_type,
			d.invoice_no,
			DATE_FORMAT(d.invoice_date,'%Y-%m-%d') AS invoice_date,
			DATE_FORMAT(d.due_date,'%Y-%m-%d') AS due_date,
			DATE_FORMAT(COALESCE(d.due_date, DATE_ADD(d.invoice_date, INTERVAL 30 DAY)),'%Y-%m-%d') AS effective_due_date,
			d.amount, d.paid_amount,
			(d.amount - d.paid_amount) AS remaining_amount,
			d.description, d.status,
			d.pending_amount,
			DATE_FORMAT(d.pending_payment_date,'%Y-%m-%d') AS pending_payment_date,
			d.pending_source_fund,
			d.pending_notes,
			d.pending_by,
			d.approved_by,
			DATE_FORMAT(d.approved_at,'%Y-%m-%d %H:%i') AS approved_at,
			d.rejected_notes,
			DATEDIFF(CURRENT_DATE(), d.invoice_date) AS days_overdue,
			DATEDIFF(COALESCE(d.due_date, DATE_ADD(d.invoice_date, INTERVAL 30 DAY)), CURRENT_DATE()) AS days_until_due
		FROM debts d
		JOIN contacts c ON d.contact_id = c.id
		JOIN companies comp ON d.company_id = comp.id
		WHERE d.status = 'pending_approval'
		ORDER BY d.id DESC
	`);

	// Query hutang yang sudah lunas (histori) dari SEMUA perusahaan
	const [paidRows]: any = await db.query(`
		SELECT
			d.id, d.company_id, d.contact_id,
			comp.code AS company_code, comp.name AS company_name,
			c.name AS contact_name, c.type AS contact_type,
			d.invoice_no,
			DATE_FORMAT(d.invoice_date,'%Y-%m-%d') AS invoice_date,
			DATE_FORMAT(d.due_date,'%Y-%m-%d') AS due_date,
			DATE_FORMAT(COALESCE(d.due_date, DATE_ADD(d.invoice_date, INTERVAL 30 DAY)),'%Y-%m-%d') AS effective_due_date,
			d.amount, d.paid_amount,
			(d.amount - d.paid_amount) AS remaining_amount,
			d.description, d.status,
			d.approved_by,
			DATE_FORMAT(d.approved_at,'%Y-%m-%d %H:%i') AS approved_at
		FROM debts d
		JOIN contacts c ON d.contact_id = c.id
		JOIN companies comp ON d.company_id = comp.id
		WHERE d.status = 'paid'
		ORDER BY d.created_at DESC
	`);

	// Query histori pembayaran harian dari SEMUA perusahaan
	const [paymentRows]: any = await db.query(`
		SELECT
			p.id, p.debt_id, p.company_id,
			comp.code AS company_code,
			DATE_FORMAT(p.payment_date,'%Y-%m-%d') AS payment_date,
			p.amount_paid, p.source_fund, p.notes,
			c.name AS contact_name,
			d.description AS debt_description,
			d.invoice_no
		FROM payments p
		JOIN debts d ON p.debt_id = d.id
		JOIN contacts c ON d.contact_id = c.id
		JOIN companies comp ON p.company_id = comp.id
		ORDER BY p.payment_date DESC, p.id DESC
	`);

	// Query pelaporan saldo harian dari SEMUA perusahaan
	const [balanceRows]: any = await db.query(`
		SELECT
			b.id, b.company_id,
			comp.code AS company_code, comp.name AS company_name,
			DATE_FORMAT(b.balance_date, '%Y-%m-%d') AS balance_date,
			b.balance_amount, b.notes,
			DATE_FORMAT(b.created_at, '%d/%m/%Y %H:%i') AS created_at_fmt
		FROM daily_balances b
		JOIN companies comp ON b.company_id = comp.id
		ORDER BY b.balance_date DESC, b.id DESC
	`);

	// Query ringkasan saldo terakhir masing-masing perusahaan (ART dan KNM)
	const [latestBalances]: any = await db.query(`
		SELECT 
			c.id AS company_id,
			c.code, c.name,
			b.balance_amount,
			DATE_FORMAT(b.balance_date, '%Y-%m-%d') AS balance_date,
			b.notes
		FROM companies c
		LEFT JOIN daily_balances b ON b.id = (
			SELECT b2.id FROM daily_balances b2 
			WHERE b2.company_id = c.id 
			ORDER BY b2.balance_date DESC, b2.id DESC 
			LIMIT 1
		)
		ORDER BY c.id ASC
	`);

	const allActiveDebts = activeRows.map((r: any) => {
		const remaining = Number(r.remaining_amount);
		const daysOverdue = Number(r.days_overdue);
		const daysUntilDue = Number(r.days_until_due);

		let aging_bucket: '0-30' | '31-60' | '61-90' | '91-120' | '>120';
		if (daysOverdue <= 30) aging_bucket = '0-30';
		else if (daysOverdue <= 60) aging_bucket = '31-60';
		else if (daysOverdue <= 90) aging_bucket = '61-90';
		else if (daysOverdue <= 120) aging_bucket = '91-120';
		else aging_bucket = '>120';

		let urgency: 'safe' | 'h5' | 'overdue' = 'safe';
		if (daysUntilDue < 0) urgency = 'overdue';
		else if (daysUntilDue <= 5) urgency = 'h5';

		return {
			...r,
			amount: Number(r.amount),
			paid_amount: Number(r.paid_amount),
			remaining_amount: remaining,
			pending_amount: r.pending_amount ? Number(r.pending_amount) : remaining,
			days_overdue: daysOverdue,
			days_until_due: daysUntilDue,
			aging_bucket,
			urgency
		};
	});

	const allPendingDebts = pendingRows.map((r: any) => {
		const remaining = Number(r.remaining_amount);
		const daysOverdue = Number(r.days_overdue || 0);
		const daysUntilDue = Number(r.days_until_due || 0);

		return {
			...r,
			amount: Number(r.amount),
			paid_amount: Number(r.paid_amount),
			remaining_amount: remaining,
			pending_amount: r.pending_amount !== null && r.pending_amount !== undefined ? Number(r.pending_amount) : remaining,
			days_overdue: daysOverdue,
			days_until_due: daysUntilDue,
			aging_bucket: '0-30' as const,
			urgency: 'safe' as const
		};
	});

	const allPaidDebts = paidRows.map((r: any) => ({
		...r,
		amount: Number(r.amount),
		paid_amount: Number(r.paid_amount),
		remaining_amount: Number(r.remaining_amount),
		days_overdue: 0,
		days_until_due: 0,
		aging_bucket: '0-30' as const,
		urgency: 'safe' as const
	}));

	const allDailyBalances = balanceRows.map((r: any) => ({
		...r,
		balance_amount: Number(r.balance_amount)
	}));

	const allPayments = paymentRows.map((r: any) => ({
		...r,
		amount_paid: Number(r.amount_paid)
	}));

	// Backward-compatibility filtered by current company
	const activeDebts = allActiveDebts.filter((d: any) => d.company_id === currentCompany.id);
	const pendingDebts = allPendingDebts.filter((d: any) => d.company_id === currentCompany.id);
	const paidDebts = allPaidDebts.filter((d: any) => d.company_id === currentCompany.id);
	const dailyBalances = allDailyBalances.filter((b: any) => b.company_id === currentCompany.id);
	const payments = allPayments.filter((p: any) => p.company_id === currentCompany.id);

	// Hitung aging default untuk PT aktif
	const aging = { b0_30: 0, b31_60: 0, b61_90: 0, b91_120: 0, b_over120: 0, total: 0 };
	for (const d of activeDebts) {
		if (d.aging_bucket === '0-30') aging.b0_30 += d.remaining_amount;
		else if (d.aging_bucket === '31-60') aging.b31_60 += d.remaining_amount;
		else if (d.aging_bucket === '61-90') aging.b61_90 += d.remaining_amount;
		else if (d.aging_bucket === '91-120') aging.b91_120 += d.remaining_amount;
		else aging.b_over120 += d.remaining_amount;
		aging.total += d.remaining_amount;
	}

	const contacts: any[] = [];
	const [cRows]: any = await db.query('SELECT id, name, type FROM contacts ORDER BY name');
	contacts.push(...cRows);

	return {
		currentUser: {
			username: currentUser.username,
			name: currentUser.name,
			role: currentUser.role
		},
		companies,
		currentCompany,
		allActiveDebts,
		allPendingDebts,
		allPaidDebts,
		allDailyBalances,
		allPayments,
		activeDebts,
		pendingDebts,
		paidDebts,
		payments,
		dailyBalances,
		latestBalancesSummary: latestBalances.map((r: any) => ({
			...r,
			balance_amount: r.balance_amount !== null && r.balance_amount !== undefined ? Number(r.balance_amount) : null
		})),
		contacts,
		aging
	};
};

export const actions: Actions = {
	// Tambah tagihan baru dari bon/nota
	addDebt: async ({ request }) => {
		const f = await request.formData();
		const company_id = Number(f.get('company_id'));
		const contact_id_raw = f.get('contact_id')?.toString().trim();
		let contact_name = f.get('contact_name')?.toString().trim() || '';
		const contact_type = (f.get('contact_type')?.toString() || 'supplier') as 'supplier' | 'non_vendor';
		const invoice_no = f.get('invoice_no')?.toString().trim() || null;
		const invoice_date = f.get('invoice_date')?.toString().trim() || '';
		const has_due = f.get('has_due') === 'yes';
		const due_date = has_due ? (f.get('due_date')?.toString().trim() || null) : null;
		const amount = parseFloat(f.get('amount')?.toString().replace(/\D/g, '') || '0');
		const description = f.get('description')?.toString().trim() || '';

		if (!invoice_date) return fail(400, { error: 'Tanggal bon wajib diisi' });
		if (!amount || amount <= 0) return fail(400, { error: 'Jumlah tagihan wajib diisi' });
		if (!description) return fail(400, { error: 'Keterangan wajib diisi' });

		const db = await getDb();
		let contactId: number | null = null;

		// 1. Jika dikirim ID supplier dari dropdown yang sudah ada
		if (contact_id_raw && !isNaN(Number(contact_id_raw))) {
			const [cRows]: any = await db.query('SELECT id, name FROM contacts WHERE id = ?', [Number(contact_id_raw)]);
			if (cRows.length > 0) {
				contactId = cRows[0].id;
				contact_name = cRows[0].name;
			}
		}

		// 2. Jika dikirim nama supplier (bisa supplier lama atau baru)
		if (!contactId && contact_name) {
			const [existing]: any = await db.query('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)', [contact_name]);
			if (existing.length > 0) {
				contactId = existing[0].id;
			} else {
				const [res]: any = await db.query('INSERT INTO contacts (name, type) VALUES (?, ?)', [contact_name, contact_type]);
				contactId = res.insertId;
			}
		}

		// Jika tetap tidak ada nama/id supplier
		if (!contactId) {
			return fail(400, { error: 'Nama supplier/toko wajib dipilih atau diisi' });
		}

		await db.query(
			`INSERT INTO debts (company_id, contact_id, invoice_no, invoice_date, due_date, amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[company_id, contactId, invoice_no, invoice_date, due_date, amount, description]
		);

		return { success: true };
	},

	// 1. Mengajukan pembayaran tagihan ke Atasan untuk di-ACC
	requestApproval: async ({ request, cookies }) => {
		const sessionId = cookies.get('finance_session');
		const currentUser = sessionId ? await getSessionUser(sessionId) : null;
		const f = await request.formData();
		const debt_id = Number(f.get('debt_id'));
		const payment_date = f.get('payment_date')?.toString().trim() || new Date().toISOString().split('T')[0];
		const amount_paid = parseFloat(f.get('amount_paid')?.toString().replace(/\D/g, '') || '0');
		const source_fund = f.get('source_fund')?.toString().trim() || 'Tunai';
		const notes = f.get('notes')?.toString().trim() || null;

		if (!debt_id || amount_paid <= 0) return fail(400, { error: 'Nominal pengajuan pembayaran tidak valid' });

		const db = await getDb();
		const [rows]: any = await db.query('SELECT * FROM debts WHERE id = ?', [debt_id]);
		if (!rows.length) return fail(404, { error: 'Tagihan tidak ditemukan' });

		const debt = rows[0];
		if (debt.status === 'paid') return fail(400, { error: 'Tagihan ini sudah lunas' });

		const requesterName = currentUser?.name || currentUser?.username || 'Petugas Keuangan';

		await db.query(`
			UPDATE debts
			SET status = 'pending_approval',
			    pending_amount = ?,
			    pending_payment_date = ?,
			    pending_source_fund = ?,
			    pending_notes = ?,
			    pending_by = ?,
			    rejected_notes = NULL
			WHERE id = ?
		`, [amount_paid, payment_date, source_fund, notes, requesterName, debt_id]);

		return { success: true, requested: true };
	},

	// 2. Atasan (Pak Denny) menyetujui / ACC pembayaran hutang -> status jadi 'paid' / masuk tabel payments
	approveDebtPayment: async ({ request, cookies }) => {
		const sessionId = cookies.get('finance_session');
		const currentUser = sessionId ? await getSessionUser(sessionId) : null;
		const f = await request.formData();
		const debt_id = Number(f.get('debt_id'));

		if (!debt_id) return fail(400, { error: 'ID tagihan tidak valid' });

		const db = await getDb();
		const conn = await db.getConnection();

		try {
			await conn.beginTransaction();
			const [rows]: any = await conn.query('SELECT * FROM debts WHERE id = ? FOR UPDATE', [debt_id]);
			if (!rows.length) {
				await conn.rollback();
				return fail(404, { error: 'Tagihan tidak ditemukan' });
			}

			const debt = rows[0];
			const remaining = Number(debt.amount) - Number(debt.paid_amount);
			const payAmount = debt.pending_amount !== null && debt.pending_amount !== undefined ? Number(debt.pending_amount) : remaining;
			const newPaid = Number(debt.paid_amount) + payAmount;
			const total = Number(debt.amount);
			const newStatus = newPaid >= total ? 'paid' : 'partially_paid';

			const paymentDate = debt.pending_payment_date || new Date().toISOString().split('T')[0];
			const sourceFund = debt.pending_source_fund || 'Tunai';
			const approverName = currentUser?.name || 'Pak Denny (Atasan)';
			const paymentNotes = debt.pending_notes ? `${debt.pending_notes} (Di-ACC oleh ${approverName})` : `Disetujui & di-ACC oleh ${approverName}`;

			await conn.query(
				`INSERT INTO payments (debt_id, company_id, payment_date, amount_paid, source_fund, notes) VALUES (?, ?, ?, ?, ?, ?)`,
				[debt_id, debt.company_id, paymentDate, payAmount, sourceFund, paymentNotes]
			);

			await conn.query(
				`UPDATE debts
				 SET paid_amount = ?,
				     status = ?,
				     approved_by = ?,
				     approved_at = NOW(),
				     pending_amount = NULL,
				     pending_notes = NULL,
				     rejected_notes = NULL
				 WHERE id = ?`,
				[newPaid, newStatus, approverName, debt_id]
			);

			await conn.commit();
			return { success: true, approved: true, paid_off: newStatus === 'paid' };
		} catch (e: any) {
			await conn.rollback();
			console.error('Error approving debt:', e);
			return fail(500, { error: 'Gagal menyetujui pembayaran tagihan' });
		} finally {
			conn.release();
		}
	},

	// 3. Atasan menolak ACC -> status kembali ke 'unpaid' / 'partially_paid' (balik ke OS Hutang)
	rejectDebtApproval: async ({ request, cookies }) => {
		const sessionId = cookies.get('finance_session');
		const currentUser = sessionId ? await getSessionUser(sessionId) : null;
		const f = await request.formData();
		const debt_id = Number(f.get('debt_id'));
		const reason = f.get('reason')?.toString().trim() || 'Ditolak oleh atasan (butuh konfirmasi ulang)';

		if (!debt_id) return fail(400, { error: 'ID tagihan tidak valid' });

		const db = await getDb();
		const [rows]: any = await db.query('SELECT * FROM debts WHERE id = ?', [debt_id]);
		if (!rows.length) return fail(404, { error: 'Tagihan tidak ditemukan' });

		const debt = rows[0];
		const prevStatus = Number(debt.paid_amount) > 0 ? 'partially_paid' : 'unpaid';

		await db.query(
			`UPDATE debts
			 SET status = ?,
			     rejected_notes = ?,
			     pending_amount = NULL,
			     pending_notes = NULL,
			     pending_by = NULL
			 WHERE id = ?`,
			[prevStatus, `${reason} (oleh ${currentUser?.name || 'Pak Denny'})`, debt_id]
		);

		return { success: true, rejected: true };
	},

	// 4. Membatalkan pengajuan oleh staff sendiri (balik ke OS Hutang)
	cancelApprovalRequest: async ({ request }) => {
		const f = await request.formData();
		const debt_id = Number(f.get('debt_id'));
		if (!debt_id) return fail(400, { error: 'ID tagihan tidak valid' });

		const db = await getDb();
		const [rows]: any = await db.query('SELECT * FROM debts WHERE id = ?', [debt_id]);
		if (!rows.length) return fail(404, { error: 'Tagihan tidak ditemukan' });

		const debt = rows[0];
		const prevStatus = Number(debt.paid_amount) > 0 ? 'partially_paid' : 'unpaid';

		await db.query(
			`UPDATE debts
			 SET status = ?,
			     pending_amount = NULL,
			     pending_notes = NULL,
			     pending_by = NULL
			 WHERE id = ?`,
			[prevStatus, debt_id]
		);

		return { success: true, cancelled: true };
	},

	// Bayar tagihan langsung (opsional / fallback jika tanpa antrean)
	payDebt: async ({ request, cookies }) => {
		const sessionId = cookies.get('finance_session');
		const currentUser = sessionId ? await getSessionUser(sessionId) : null;
		const f = await request.formData();
		const debt_id = Number(f.get('debt_id'));
		const payment_date = f.get('payment_date')?.toString().trim() || '';
		const amount_paid = parseFloat(f.get('amount_paid')?.toString().replace(/\D/g, '') || '0');
		const source_fund = f.get('source_fund')?.toString().trim() || 'Tunai';
		const notes = f.get('notes')?.toString().trim() || null;

		if (!debt_id || !payment_date || amount_paid <= 0) return fail(400, { error: 'Data pembayaran tidak lengkap' });

		const db = await getDb();
		const conn = await db.getConnection();

		try {
			await conn.beginTransaction();
			const [rows]: any = await conn.query('SELECT * FROM debts WHERE id = ? FOR UPDATE', [debt_id]);
			if (!rows.length) { await conn.rollback(); return fail(404, { error: 'Data tidak ditemukan' }); }

			const debt = rows[0];
			const newPaid = Number(debt.paid_amount) + amount_paid;
			const total = Number(debt.amount);
			const newStatus = newPaid >= total ? 'paid' : 'partially_paid';

			await conn.query(`INSERT INTO payments (debt_id, company_id, payment_date, amount_paid, source_fund, notes) VALUES (?, ?, ?, ?, ?, ?)`,
				[debt_id, debt.company_id, payment_date, amount_paid, source_fund, notes]);
			await conn.query(`UPDATE debts SET paid_amount = ?, status = ? WHERE id = ?`, [newPaid, newStatus, debt_id]);

			await conn.commit();
			return { success: true, paid_off: newStatus === 'paid' };
		} catch (e: any) {
			await conn.rollback();
			return fail(500, { error: 'Gagal memproses pembayaran' });
		} finally {
			conn.release();
		}
	},

	// Hapus tagihan (jika salah input)
	deleteDebt: async ({ request }) => {
		const f = await request.formData();
		const debt_id = Number(f.get('debt_id'));
		if (!debt_id) return fail(400, { error: 'ID tidak valid' });
		const db = await getDb();
		await db.query('DELETE FROM payments WHERE debt_id = ?', [debt_id]);
		await db.query('DELETE FROM debts WHERE id = ?', [debt_id]);
		return { success: true };
	},

	// Simpan / update saldo harian
	saveDailyBalance: async ({ request }) => {
		const f = await request.formData();
		const company_id = Number(f.get('company_id'));
		const balance_date = f.get('balance_date')?.toString().trim() || '';
		const rawAmount = f.get('balance_amount')?.toString().replace(/[^0-9]/g, '') || '0';
		const balance_amount = parseFloat(rawAmount);
		const notes = f.get('notes')?.toString().trim() || null;

		if (!company_id || !balance_date) {
			return fail(400, { error: 'Tanggal saldo wajib dipilih' });
		}

		const db = await getDb();
		await db.query(`
			INSERT INTO daily_balances (company_id, balance_date, balance_amount, notes)
			VALUES (?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				balance_amount = VALUES(balance_amount),
				notes = VALUES(notes),
				created_at = CURRENT_TIMESTAMP
		`, [company_id, balance_date, balance_amount, notes]);

		return { success: true, balance_saved: true };
	},

	// Hapus catatan saldo harian
	deleteDailyBalance: async ({ request }) => {
		const f = await request.formData();
		const balance_id = Number(f.get('balance_id'));
		if (!balance_id) return fail(400, { error: 'ID saldo tidak valid' });
		const db = await getDb();
		await db.query('DELETE FROM daily_balances WHERE id = ?', [balance_id]);
		return { success: true, balance_deleted: true };
	},

	// Tambah pengeluaran / pembayaran langsung tanpa bon (karyawan, belanja operasional, kasbon, dsb)
	addDirectPayment: async ({ request }) => {
		const f = await request.formData();
		const company_id = Number(f.get('company_id'));
		let recipient = f.get('recipient')?.toString().trim() || '';
		const payment_date = f.get('payment_date')?.toString().trim() || '';
		const amount = parseFloat(f.get('amount')?.toString().replace(/\D/g, '') || '0');
		const description = f.get('description')?.toString().trim() || '';

		if (!company_id) return fail(400, { error: 'Perusahaan (PT) tidak valid' });
		if (!recipient) return fail(400, { error: 'Kolom "Untuk Siapa" wajib diisi' });
		if (!payment_date) return fail(400, { error: 'Tanggal pengeluaran wajib diisi' });
		if (!amount || amount <= 0) return fail(400, { error: 'Jumlah pengeluaran wajib diisi' });
		if (!description) return fail(400, { error: 'Keterangan pengeluaran wajib diisi' });

		const db = await getDb();
		const conn = await db.getConnection();

		try {
			await conn.beginTransaction();

			// 1. Cari atau buat contact untuk penerima
			let contactId: number;
			const [existing]: any = await conn.query('SELECT id FROM contacts WHERE LOWER(name) = LOWER(?)', [recipient]);
			if (existing.length > 0) {
				contactId = existing[0].id;
			} else {
				const [res]: any = await conn.query('INSERT INTO contacts (name, type) VALUES (?, "non_vendor")', [recipient]);
				contactId = res.insertId;
			}

			// 2. Simpan record debt dengan status 'paid' (langsung lunas)
			const [debtRes]: any = await conn.query(
				`INSERT INTO debts (company_id, contact_id, invoice_no, invoice_date, due_date, amount, paid_amount, description, status) 
				 VALUES (?, ?, 'Tanpa Bon', ?, ?, ?, ?, ?, 'paid')`,
				[company_id, contactId, payment_date, payment_date, amount, amount, description]
			);
			const debtId = debtRes.insertId;

			// 3. Simpan record payment di tabel payments
			await conn.query(
				`INSERT INTO payments (debt_id, company_id, payment_date, amount_paid, source_fund, notes) 
				 VALUES (?, ?, ?, ?, 'Kas Langsung', ?)`,
				[debtId, company_id, payment_date, amount, description]
			);

			await conn.commit();
			return { success: true, direct_payment_saved: true };
		} catch (e: any) {
			await conn.rollback();
			console.error('Error addDirectPayment:', e);
			return fail(500, { error: 'Gagal menyimpan pengeluaran langsung: ' + (e?.message || 'Database error') });
		} finally {
			conn.release();
		}
	},
};
