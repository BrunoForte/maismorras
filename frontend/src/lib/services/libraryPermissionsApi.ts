import type { Session } from '@supabase/supabase-js';
import { request } from './httpClient';
export type LibraryPermission = { userIds: string[]; isGM: boolean; restricted: boolean };
export async function loadLibraryPermissions(
	session: Session,
	campaignId: string,
	itemType: 'asset' | 'note',
	itemKey: string
) {
	const query =
		'?itemType=' + encodeURIComponent(itemType) + '&itemKey=' + encodeURIComponent(itemKey);
	return request<LibraryPermission>(
		session,
		`/api/v1/campaigns/${campaignId}/library-permissions${query}`,
		{},
		'Não foi possível carregar as permissões.'
	);
}
export async function saveLibraryPermissions(
	session: Session,
	campaignId: string,
	itemType: 'asset' | 'note',
	itemKey: string,
	userIds: string[],
	restricted: boolean
) {
	return request<LibraryPermission>(
		session,
		`/api/v1/campaigns/${campaignId}/library-permissions`,
		{ method: 'PUT', body: JSON.stringify({ itemType, itemKey, userIds, restricted }) },
		'Não foi possível salvar as permissões.'
	);
}
