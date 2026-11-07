import { describe, expect, it } from 'vitest';
import type { CompendiumEntry } from '$lib/services/compendiumApi';
import {
	retainCompatibleSubclass,
	subclassBaseClassLabel,
	subclassMatchesClass,
	subclassOptionsForClass
} from './subclassAssociations';

const classEntry = (id: string, name: string, classId: string): CompendiumEntry => ({
	id,
	sourceId: 'srd',
	entryType: 'class',
	name,
	summary: '',
	rules: { id: classId },
	translations: {},
	isPublished: true
});

const subclassEntry = (
	id: string,
	name: string,
	rules: Record<string, unknown>
): CompendiumEntry => ({
	id,
	sourceId: 'srd',
	entryType: 'subclass',
	name,
	summary: '',
	rules,
	translations: {},
	isPublished: true
});

describe('subclass associations', () => {
	const classes = [
		classEntry('class-fighter', 'Fighter', 'fighter'),
		classEntry('class-cleric', 'Cleric', 'cleric')
	];
	const entries = [
		subclassEntry('champion', 'Champion', { classId: 'class-fighter', className: 'Fighter' }),
		subclassEntry('eldritch-knight', 'Eldritch Knight', { className: 'Fighter' }),
		subclassEntry('life', 'Life Domain', { parentClass: 'Cleric' }),
		subclassEntry('unlinked', 'Unlinked Option', {})
	];

	it('does not show subclasses before a class is selected and excludes unlinked entries', () => {
		expect(subclassOptionsForClass(entries, '', ['Local fallback'], classes)).toEqual([]);
		expect(subclassOptionsForClass(entries, 'Fighter', ['Local fallback'], classes)).toEqual([
			'Champion',
			'Eldritch Knight'
		]);
		expect(subclassMatchesClass(entries[2], 'Fighter', classes)).toBe(false);
	});

	it('uses local class options only when the compendium has none for that class', () => {
		expect(subclassOptionsForClass(entries, 'Wizard', ['Evoker'], classes)).toEqual(['Evoker']);
	});

	it('drops a subclass that is incompatible with the newly selected class', () => {
		const optionsAfterClassChange = subclassOptionsForClass(entries, 'Cleric', [], classes);
		expect(retainCompatibleSubclass('Champion', optionsAfterClassChange)).toBe('');
		expect(retainCompatibleSubclass('Life Domain', optionsAfterClassChange)).toBe('Life Domain');
	});

	it('recognizes and localizes a base class found only through its stable class id', () => {
		const subclass = subclassEntry('champion', 'Champion', { classId: 'class-fighter' });
		expect(subclassBaseClassLabel(subclass, classes, 'pt-BR')).toBe('Guerreiro');
		expect(
			subclassBaseClassLabel(
				subclassEntry('champion', 'Champion', { classId: 'fighter' }),
				[],
				'pt-BR'
			)
		).toBe('Guerreiro');
		expect(
			subclassBaseClassLabel(
				subclassEntry('champion', 'Champion', { className: 'Fighter' }),
				[],
				'pt-BR'
			)
		).toBe('Guerreiro');
		expect(
			subclassBaseClassLabel(
				subclassEntry('champion', 'Champion', { parentClass: 'fighter' }),
				[],
				'pt-BR'
			)
		).toBe('Guerreiro');
	});
});
