import crypto from 'crypto';
import { getDb } from './db';

const SALT = 'Finance_Secure_Salt_2026';

// In-memory temp tokens store for Step 1 -> Step 2 (valid for 5 minutes)
const tempTokens = new Map<string, { userId: number; username: string; expiresAt: number }>();

export function hashSecret(secret: string): string {
	return crypto.createHash('sha256').update(`${secret}_${SALT}`).digest('hex');
}

export function generateToken(): string {
	return crypto.randomBytes(32).toString('hex');
}

/**
 * Step 1: Validasi Username & Password dari database
 */
export async function validateStep1(username: string, pass: string) {
	const db = await getDb();
	const [rows]: any = await db.query(
		'SELECT id, username, password_hash, name, role FROM users WHERE username = ?',
		[username]
	);

	if (rows.length === 0) {
		return { success: false, error: 'Username tidak ditemukan' };
	}

	const user = rows[0];
	const inputHash = hashSecret(pass);

	if (user.password_hash !== inputHash) {
		return { success: false, error: 'Password salah' };
	}

	// Generate temporary token untuk tahap 2 (PIN)
	const tempToken = generateToken();
	tempTokens.set(tempToken, {
		userId: user.id,
		username: user.username,
		expiresAt: Date.now() + 5 * 60 * 1000 // 5 menit
	});

	return {
		success: true,
		temp_token: tempToken,
		user: {
			id: user.id,
			username: user.username,
			name: user.name
		}
	};
}

/**
 * Step 2: Validasi PIN dari database berdasarkan temp_token
 */
export async function validateStep2(tempToken: string, pin: string) {
	const entry = tempTokens.get(tempToken);
	if (!entry || entry.expiresAt < Date.now()) {
		tempTokens.delete(tempToken);
		return { success: false, error: 'Sesi login telah kedaluwarsa. Silakan ulangi dari awal.' };
	}

	const db = await getDb();
	const [rows]: any = await db.query(
		'SELECT id, username, pin_hash, name, role FROM users WHERE id = ?',
		[entry.userId]
	);

	if (rows.length === 0) {
		return { success: false, error: 'Akun tidak ditemukan' };
	}

	const user = rows[0];
	const inputPinHash = hashSecret(pin);

	if (user.pin_hash !== inputPinHash) {
		return { success: false, error: 'PIN verifikasi salah' };
	}

	// Hapus temp token setelah berhasil
	tempTokens.delete(tempToken);

	// Buat session permanen (berlaku 7 hari)
	const sessionId = generateToken();
	const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	await db.query(
		'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
		[sessionId, user.id, expiresAt]
	);

	return {
		success: true,
		sessionId,
		expiresAt,
		user: {
			id: user.id,
			username: user.username,
			name: user.name,
			role: user.role
		}
	};
}

/**
 * Cek session id yang tersimpan di cookie
 */
export async function getSessionUser(sessionId: string) {
	if (!sessionId) return null;
	const db = await getDb();

	const [rows]: any = await db.query(
		`SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.username, u.name, u.role
		 FROM sessions s
		 JOIN users u ON s.user_id = u.id
		 WHERE s.id = ? AND s.expires_at > NOW()`,
		[sessionId]
	);

	if (rows.length === 0) return null;
	return rows[0];
}

export async function deleteSession(sessionId: string) {
	if (!sessionId) return;
	const db = await getDb();
	await db.query('DELETE FROM sessions WHERE id = ?', [sessionId]);
}

export interface RegisterParams {
	name: string;
	username: string;
	password: string;
	pin: string;
	role: 'admin' | 'boss';
}

/**
 * Registrasi pengguna baru (Admin atau Boss)
 */
export async function registerUser(params: RegisterParams) {
	const name = (params.name || '').trim();
	const username = (params.username || '').trim().toLowerCase();
	const password = params.password || '';
	const pin = (params.pin || '').trim();
	const role = params.role === 'boss' ? 'boss' : 'admin';

	if (!name) {
		return { success: false, error: 'Nama lengkap wajib diisi' };
	}
	if (!username || username.length < 3) {
		return { success: false, error: 'Username minimal 3 karakter' };
	}
	if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
		return { success: false, error: 'Username hanya boleh berisi huruf, angka, underscore, titik, atau strip' };
	}
	if (!password || password.length < 6) {
		return { success: false, error: 'Password minimal 6 karakter' };
	}
	if (!pin || !/^\d{6}$/.test(pin)) {
		return { success: false, error: 'PIN keamanan harus tepat 6 digit angka' };
	}

	const db = await getDb();

	// Proteksi Keamanan: Batasi hanya 1 akun per role (1 Admin & 1 Boss)
	const [existingRoleUser]: any = await db.query(
		'SELECT id, username, name FROM users WHERE role = ? LIMIT 1',
		[role]
	);
	if (existingRoleUser.length > 0) {
		const roleLabel = role === 'boss' ? 'Boss / Atasan' : 'Admin Keuangan';
		return {
			success: false,
			error: `Akun untuk peran ${roleLabel} sudah terdaftar (${existingRoleUser[0].username}). Tidak dapat membuat akun ${roleLabel} baru demi keamanan sistem.`
		};
	}

	const [existing]: any = await db.query('SELECT id FROM users WHERE username = ?', [username]);
	if (existing.length > 0) {
		return { success: false, error: `Username "${username}" sudah digunakan. Silakan gunakan yang lain.` };
	}

	const password_hash = hashSecret(password);
	const pin_hash = hashSecret(pin);

	const [result]: any = await db.query(
		'INSERT INTO users (username, password_hash, pin_hash, name, role) VALUES (?, ?, ?, ?, ?)',
		[username, password_hash, pin_hash, name, role]
	);

	return {
		success: true,
		userId: result.insertId,
		user: {
			id: result.insertId,
			username,
			name,
			role
		}
	};
}

/**
 * Cek ketersediaan peran (apakah admin atau boss sudah terdaftar)
 */
export async function getRoleAvailability() {
	const db = await getDb();
	const [rows]: any = await db.query('SELECT role, COUNT(*) as cnt FROM users GROUP BY role');

	let hasAdmin = false;
	let hasBoss = false;
	for (const r of rows) {
		if (r.role === 'admin' && Number(r.cnt) > 0) hasAdmin = true;
		if (r.role === 'boss' && Number(r.cnt) > 0) hasBoss = true;
	}

	return {
		adminAvailable: !hasAdmin,
		bossAvailable: !hasBoss,
		allFull: hasAdmin && hasBoss
	};
}


