import { json } from '@sveltejs/kit';
import { validateStep2 } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const { temp_token, pin } = await request.json();

		if (!temp_token || !pin) {
			return json({ error: 'PIN 6-digit wajib diisi' }, { status: 400 });
		}

		const result = await validateStep2(temp_token, pin.trim());

		if (!result.success) {
			return json({ error: result.error || 'PIN verifikasi salah' }, { status: 401 });
		}

		// Simpan cookie session 7 hari
		cookies.set('finance_session', result.sessionId!, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false, // development localhost
			maxAge: 7 * 24 * 60 * 60
		});

		return json({
			success: true,
			redirect: '/',
			user: result.user
		});
	} catch (err: any) {
		console.error('[Login Step 2 Error]', err);
		return json({ error: 'Terjadi kesalahan pada server' }, { status: 500 });
	}
};
