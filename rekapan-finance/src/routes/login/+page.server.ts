import { redirect } from '@sveltejs/kit';
import { getSessionUser, getRoleAvailability } from '$lib/server/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	const sessionId = cookies.get('finance_session');
	if (sessionId) {
		const user = await getSessionUser(sessionId);
		if (user) {
			throw redirect(303, '/');
		}
	}
	const rolesStatus = await getRoleAvailability();
	return {
		rolesStatus
	};
};
