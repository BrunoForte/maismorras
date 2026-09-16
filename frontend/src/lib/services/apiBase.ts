const configured = String(import.meta.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

export const apiBase =
	configured && !configured.includes('maismorras.vercel.app')
		? configured
		: import.meta.env.DEV
			? 'http://localhost:8080'
			: 'https://maismorras-api-454646414754.southamerica-east1.run.app';
