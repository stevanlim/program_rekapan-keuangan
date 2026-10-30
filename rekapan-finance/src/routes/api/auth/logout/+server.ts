import { json, redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('finance_session');
	if (sessionId) {
		await deleteSession(sessionId);
		cookies.delete('finance_session', { path: '/' });
	}
	return json({ success: true, redirect: '/login' });
};

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionId = cookies.get('finance_session');
	if (sessionId) {
		await deleteSession(sessionId);
		cookies.delete('finance_session', { path: '/' });
	}
	throw redirect(303, '/login');
};
