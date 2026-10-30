import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

function getSavedTheme(): Theme {
	if (!browser) return 'light';
	try {
		return (localStorage.getItem('app_theme') as Theme) || 'light';
	} catch {
		return 'light';
	}
}

export const theme = writable<Theme>(getSavedTheme());

function applyTheme(t: Theme) {
	if (!browser) return;
	const root = document.documentElement;
	root.setAttribute('data-theme', t);
	if (t === 'dark') {
		root.classList.add('dark');
		root.classList.remove('light');
	} else {
		root.classList.add('light');
		root.classList.remove('dark');
	}
}

export function setTheme(t: Theme) {
	theme.set(t);
	if (browser) {
		try {
			localStorage.setItem('app_theme', t);
		} catch {}
		applyTheme(t);
	}
}

export function toggleTheme() {
	const current = get(theme);
	const next = current === 'dark' ? 'light' : 'dark';
	setTheme(next);
	return next;
}

export function initTheme() {
	if (!browser) return;
	const current = getSavedTheme();
	theme.set(current);
	applyTheme(current);
}
