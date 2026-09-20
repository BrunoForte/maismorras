export type OptimizedImage = { file: File; width: number; height: number };

export async function optimizeImage(
	file: File | Blob,
	maxDimension = 2048,
	quality = 0.82
): Promise<OptimizedImage> {
	if (!file.type.startsWith('image/') || typeof createImageBitmap === 'undefined')
		return {
			file: file instanceof File ? file : new File([file], 'image', { type: file.type }),
			width: 0,
			height: 0
		};
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(bitmap.width * scale));
	canvas.height = Math.max(1, Math.round(bitmap.height * scale));
	canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/webp', quality)
	);
	if (!blob)
		return {
			file: file instanceof File ? file : new File([file], 'image', { type: file.type }),
			width: canvas.width,
			height: canvas.height
		};
	const name = file instanceof File ? file.name.replace(/\.[^.]+$/, '.webp') : 'image.webp';
	return {
		file: new File([blob], name, { type: 'image/webp' }),
		width: canvas.width,
		height: canvas.height
	};
}

export async function createThumbnail(
	file: File | Blob,
	maxDimension = 512
): Promise<OptimizedImage> {
	return optimizeImage(file, maxDimension, 0.78);
}
