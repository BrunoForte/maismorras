// src/lib/services/dndApi.ts

export interface SpellListItem {
    index: string;
    name: string;
    url: string;
}

export interface SpellDetails {
    name: string;
    desc: string[];
    range: string;
    components: string[];
    ritual: boolean;
    duration: string;
    concentration: boolean;
    casting_time: string;
    level: number;
    school?: { name: string };
}

const BASE_URL = 'https://www.dnd5eapi.co/api';

// Procura a lista simplificada de todas as magias para popular a pesquisa
export async function buscarTodasMagias(): Promise<SpellListItem[]> {
    const res = await fetch(`${BASE_URL}/spells`);
    if (!res.ok) throw new Error('Erro ao buscar lista de magias');
    const data = await res.json();
    return data.results;
}

// Procura os detalhes completos de uma magia específica selecionada pelo utilizador
export async function obterDetalhesMagia(index: string): Promise<SpellDetails> {
    const res = await fetch(`${BASE_URL}/spells/${index}`);
    if (!res.ok) throw new Error('Erro ao buscar detalhes da magia');
    return await res.json();
}