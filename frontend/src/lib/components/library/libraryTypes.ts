import type { Participant } from '$lib/services/characterApi';

export type LibraryAsset = {
	name: string;
	path: string;
	url: string;
	thumbnailUrl?: string;
	type: 'image' | 'audio' | 'document' | 'map';
	audioKind?: 'music' | 'effect';
	audioLooping?: boolean;
};

export type LibraryHandout = {
	id: string;
	title: string;
	body: string;
	visibility: 'gm' | 'players';
};

export type LibraryHandoutEditor = {
	open: boolean;
	title: string;
	body: string;
	audience: 'gm' | 'all' | 'selected';
	userIds: readonly string[];
	saving: boolean;
	participants: readonly Participant[];
};

export type LibraryHandoutActions = {
	edit: (handout: LibraryHandout) => void;
	delete: (handout: LibraryHandout) => void;
	manageAccess: (handout: LibraryHandout) => void;
	save: () => void;
	changeTitle: (value: string) => void;
	changeBody: (value: string) => void;
	changeAudience: (value: LibraryHandoutEditor['audience']) => void;
	toggleUser: (userId: string) => void;
};

export type LibraryAccessDialogModel =
	| {
			kind: 'access';
			label: string;
			loading: boolean;
			saving: boolean;
			restricted: boolean;
			selectedUserIds: readonly string[];
			participants: readonly Participant[];
	  }
	| {
			kind: 'presentation';
			assetName: string;
			loading: boolean;
			restricted: boolean;
			selectedUserIds: readonly string[];
			participants: readonly Participant[];
			overlayVisible: boolean;
	  };

export type LibraryAccessDialogActions = {
	close: () => void;
	setRestricted: (restricted: boolean) => void;
	toggleUser: (userId: string) => void;
	setOverlayVisible: (visible: boolean) => void;
	saveAccess: () => void;
	confirmPresentation: () => void;
};
