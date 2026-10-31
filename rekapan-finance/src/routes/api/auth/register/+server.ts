import { json } from '@sveltejs/kit';
import { registerUser, getRoleAvailability } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const status = await getRoleAvailability();
		return json(status);
	} catch (err: any) {
		return json({ adminAvailable: true, bossAvailable: true, allFull: false, adminCount: 0, bossCount: 0, maxAdmin: 1, maxBoss: 2 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { name, username, password, pin, role } = await request.json();

		if (!name || !username || !password || !pin || !role) {
			return json({ error: 'Seluruh field (Nama, Username, Password, PIN, dan Peran) wajib diisi!' }, { status: 400 });
		}

		if (role !== 'admin' && role !== 'boss') {
			return json({ error: 'Pilihan peran tidak valid. Harus Admin atau Boss.' }, { status: 400 });
		}

		const result = await registerUser({ name, username, password, pin, role });

		if (!result.success) {
			return json({ error: result.error || 'Gagal mendaftarkan akun' }, { status: 400 });
		}

		return json({
			success: true,
			message: `Akun ${role === 'boss' ? 'Boss / Atasan' : 'Admin'} untuk "${result.user?.name}" berhasil dibuat! Silakan masuk.`,
			user: result.user
		});
	} catch (err: any) {
		console.error('[Register API Error]', err);
		return json({ error: 'Terjadi kesalahan sistem saat mendaftarkan akun.' }, { status: 500 });
	}
};
