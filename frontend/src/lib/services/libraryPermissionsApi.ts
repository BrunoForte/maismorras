import type { Session } from '@supabase/supabase-js';
import { apiBase } from './apiBase';

export type LibraryPermission = { userIds: string[]; isGM: boolean };

export async function loadLibraryPermissions(
	session: Session,
	campaignId: string,
	itemType: 'asset' | 'note',
	itemKey: string
) {
	const query =
		'?itemType=' + encodeURIComponent(itemType) + '&itemKey=' + encodeURIComponent(itemKey);
	const response = await fetch(
		apiBase + '/api/v1/campaigns/' + campaignId + '/library-permissions' + query,
		{ headers: { Authorization: 'Bearer ' + session.access_token } }
	);
	if (!response.ok) throw new Error('Não foi possível carregar as permissões.');
	return (await response.json()) as LibraryPermission;
}

export async function saveLibraryPermissions(
	session: Session,
	campaignId: string,
	itemType: 'asset' | 'note',
	itemKey: string,
	userIds: string[]
) {
	const response = await fetch(
		apiBase + '/api/v1/campaigns/' + campaignId + '/library-permissions',
		{
			method: 'PUT',
			headers: {
				Authorization: 'Bearer ' + session.access_token,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ itemType, itemKey, userIds })
		}
	);
	if (!response.ok) throw new Error('Não foi possível salvar as permissões.');
	return (await response.json()) as LibraryPermission;
}
