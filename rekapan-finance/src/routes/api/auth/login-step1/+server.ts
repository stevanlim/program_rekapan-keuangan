import { json } from '@sveltejs/kit';
import { validateStep1 } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { username, password } = await request.json();

		if (!username || !password) {
			return json({ error: 'Username dan Password wajib diisi' }, { status: 400 });
		}

		const result = await validateStep1(username.trim(), password);

		if (!result.success) {
			return json({ error: result.error || 'Username atau Password salah' }, { status: 401 });
		}

		return json({
			success: true,
			temp_token: result.temp_token,
			user: result.user
		});
	} catch (err: any) {
		console.error('[Login Step 1 Error]', err);
		return json({ error: 'Terjadi kesalahan pada server' }, { status: 500 });
	}
};
