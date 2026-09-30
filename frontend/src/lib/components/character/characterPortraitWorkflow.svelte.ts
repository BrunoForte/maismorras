import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { OptimizedImage } from '$lib/services/imageProcessing';

export type CharacterPortraitWorkflowDependencies = {
	campaignId: string;
	session: Session;
	getPortraitPath: () => string;
	setPortraitPaths: (portraitPath: string, tokenPortraitPath: string) => void;
	setMessage: (message: string) => void;
	getSupabaseClient: () => Promise<SupabaseClient | null>;
	optimizeImage: (file: File, maxDimension: number) => Promise<OptimizedImage>;
	createThumbnail: (file: Blob, maxDimension: number) => Promise<OptimizedImage>;
	getSignedAssetUrl: (session: Session, campaignId: string, path: string) => Promise<string | null>;
	generateImage: (prompt: string) => Promise<string>;
	fetchGeneratedBlob: (dataUrl: string) => Promise<Blob>;
	createId: () => string;
};

/** Owns portrait upload/generation state while delegating browser and service APIs explicitly. */
export function createCharacterPortraitWorkflow(deps: CharacterPortraitWorkflowDependencies) {
	const state = $state({ preview: null as string | null, busy: false });

	async function refreshPreview(path = deps.getPortraitPath()) {
		if (!path) {
			state.preview = null;
			return;
		}
		state.preview = await deps.getSignedAssetUrl(deps.session, deps.campaignId, path);
	}

	async function savePortrait(blob: Blob, filename: string) {
		const original = new File([blob], 'portrait', { type: blob.type });
		blob = (await deps.optimizeImage(original, 1536)).file;
		const supabase = await deps.getSupabaseClient();
		if (!supabase) throw new Error('Supabase não está configurado.');
		if (blob.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
		const { data: userData, error: userError } = await supabase.auth.getUser();
		if (userError || !userData.user) throw new Error('Sua sessão expirou. Faça login novamente.');
		if (userData.user.id !== deps.session.user.id)
			throw new Error(
				'A sessão atual não corresponde ao usuário autenticado. Faça login novamente.'
			);
		const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '-');
		const basePath = `campaigns/${deps.campaignId}/portraits/${userData.user.id}/${deps.createId()}`;
		const path = `${basePath}-${safeName}`;
		const thumbnail = await deps.createThumbnail(blob, 320);
		const tokenExtension = thumbnail.file.type === 'image/webp' ? 'webp' : 'png';
		const tokenPath = `${basePath}-token.${tokenExtension}`;
		const storage = supabase.storage.from('campaign-assets');
		const { error: thumbnailError } = await storage.upload(tokenPath, thumbnail.file, {
			contentType: thumbnail.file.type || 'image/png',
			cacheControl: '31536000',
			upsert: false
		});
		if (thumbnailError) throw thumbnailError;
		const { error } = await storage.upload(path, blob, {
			contentType: blob.type || 'image/png',
			cacheControl: '31536000',
			upsert: false
		});
		if (error) {
			await storage.remove([tokenPath]);
			throw error;
		}
		deps.setPortraitPaths(path, tokenPath);
		await refreshPreview(path);
		deps.setMessage('Retrato selecionado. Salve a ficha para atualizar o token.');
	}

	async function uploadPortrait(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
			deps.setMessage('Envie uma imagem JPG, PNG ou WebP.');
			input.value = '';
			return;
		}
		state.busy = true;
		try {
			await savePortrait(file, file.name);
		} catch (error) {
			deps.setMessage(
				error instanceof Error ? error.message : 'Não foi possível enviar o retrato.'
			);
		} finally {
			state.busy = false;
			input.value = '';
		}
	}

	async function generatePortrait(prompt: string) {
		if (state.busy || prompt.trim().length < 3) return;
		state.busy = true;
		try {
			const dataUrl = await deps.generateImage(prompt.trim());
			const blob = await deps.fetchGeneratedBlob(dataUrl);
			await savePortrait(blob, 'retrato-gerado.png');
		} catch (error) {
			deps.setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o retrato.');
		} finally {
			state.busy = false;
		}
	}

	return { state, refreshPreview, uploadPortrait, generatePortrait };
}
