// src/lib/stores/chatStore.ts
import { writable } from 'svelte/store';
import type { ResultadoRolagem } from '$lib/utils/diceRoller';

export type Mensagem = {
    id: string;
    autor: string;
    texto: string;
    tipo: 'texto' | 'rolagem';
	canal?: 'chat' | 'combat' | 'info';
    detalhesRolagem?: ResultadoRolagem;
};

export const chatMensagens = writable<Mensagem[]>([]);
