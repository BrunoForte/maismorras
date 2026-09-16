// src/lib/stores/gameStore.ts
import { writable } from 'svelte/store';

export type Atributos = {
	for: number;
	des: number;
	con: number;
	int: number;
	sab: number;
	car: number;
};

export type Arma = {
	id: string;
	nome: string;
	bonusAtaque: number;
	dano: string;
};

export const statusDisponiveis = [
	'Envenenado',
	'Atordoado',
	'Caído',
	'Imobilizado',
	'Invisível'
] as const;

export type StatusToken = (typeof statusDisponiveis)[number];

export type TokenVisibility = {
	showName: boolean;
	showHP: boolean;
	showAC: boolean;
	showStatuses: boolean;
	transparentBackground?: boolean;
	imageScale?: number;
	imageOffsetX?: number;
	imageOffsetY?: number;
};

export type Personagem = {
	id: number;
	// UUID do token persistido no backend. O id numérico continua sendo usado pelo PixiJS.
	persistedId?: string;
	actorId?: string;
	isOwned?: boolean;
	visibility: TokenVisibility;
	nome: string;
	cor: number;
	x: number;
	y: number;
	hpAtual: number;
	hpMax: number;
	ca: number;
	proficiencia: number;
	atributos: Atributos;
	armas: Arma[];
	iniciativa: number;
	// Alcance em quadrados usado pela névoa de guerra. Zero representa uma
	// criatura que não contribui para a visão compartilhada do grupo.
	visionRange: number;
	lightRange: number;
	fotoUrl?: string;
	// --- NOVOS ATRIBUTOS DE ESCALA E APARÊNCIA ---
	tamanho: number; // 1 = 1x1 quadrado, 2 = 2x2 quadrados, etc.
	fotoEscala: number; // Zoom da foto dentro do token (ex: 1.0)
	fotoOffsetX: number; // Ajuste horizontal da foto
	fotoOffsetY: number; // Ajuste vertical da foto
	status?: StatusToken[];
};

// A mesa abre vazia. Personagens e NPCs serão carregados da campanha selecionada.
export const personagens = writable<Personagem[]>([]);

export const urlMapa = writable<string | null>(null);
export const personagemSelecionadoId = writable<number | null>(null);
export const turnoAtualId = writable<number | null>(null);
