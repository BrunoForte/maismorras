import { mount, unmount } from 'svelte';
import CampaignWorkspaceHeader from '$lib/components/campaign/CampaignWorkspaceHeader.svelte';

declare global {
	interface Window {
		campaignWorkspaceHeaderEvents: string[];
	}
}

let mounted: ReturnType<typeof mount> | undefined;
let host: HTMLDivElement | undefined;

export function mountCampaignWorkspaceHeader(role: 'gm' | 'player') {
	host = document.createElement('div');
	document.body.append(host);
	const events: string[] = [];
	window.campaignWorkspaceHeaderEvents = events;
	mounted = mount(CampaignWorkspaceHeader, {
		target: host,
		props: {
			campaign: { name: 'Mesa de teste', role },
			scenes: [
				{ id: 'scene-1', name: 'Floresta' },
				{ id: 'scene-2', name: 'Ruínas' }
			],
			activeSceneId: 'scene-1',
			email: 'teste@example.test',
			locale: 'pt-BR',
			activeTab: 'map' as const,
			creatingScene: false,
			sceneCreatorOpen: true,
			sceneDraft: '',
			onreturntocampaigns: () => events.push('return'),
			onsceneselect: (id: string) => events.push(`scene:${id}`),
			ontogglescenecreator: () => events.push('toggle-scene-creator'),
			onscenedraftchange: (draft: string) => events.push(`draft:${draft}`),
			oncreatescene: () => events.push('create-scene'),
			onopenscenesettings: () => events.push('scene-settings'),
			onpublishscenetooverlay: () => events.push('publish-overlay'),
			ontabchange: (tab: string) => events.push(`tab:${tab}`),
			onlanguagechange: (locale: string) => events.push(`locale:${locale}`),
			onlogout: () => events.push('logout')
		}
	});
	return events;
}

export function unmountCampaignWorkspaceHeader() {
	if (mounted) unmount(mounted);
	host?.remove();
	mounted = undefined;
	host = undefined;
}
