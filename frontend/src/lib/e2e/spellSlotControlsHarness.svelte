<script lang="ts">
	import CharacterSpellsTab from '$lib/components/character/CharacterSpellsTab.svelte';
	import type { SpellTabActions } from '$lib/utils/character/characterSpellRules';

	let slots = $state([{ level: 1, current: 1, max: 2 }]);
	let savedSlots = $state<typeof slots>([]);
	const spellbook = {
		addableCircles: () => [1],
		availableCircles: () => [1],
		slotForCircle: (level: number) => slots.find((slot) => slot.level === level),
		spellsForCircle: () => [],
		entriesForCircle: () => [],
		compatibleSlots: () => [],
		selectedSlot: () => 1
	};
	const presentation = {
		optionLabel: (entry: { name: string }) => entry.name,
		circleLabel: (level: number) => `Círculo ${level}`,
		displayName: () => '',
		description: () => '',
		higherLevels: () => '',
		mechanics: () => ({ reviewed: false, damage: [], characterLevel: [], spellSlot: [] }),
		hasAITranslation: () => false
	};
	const actions: SpellTabActions = {
		setNewSpellName: () => {},
		setNewSpellLevel: () => {},
		setExpandedSpell: () => {},
		chooseSlot: () => {},
		setAvailableSpellSlots: async (level, current) => {
			slots = slots.map((slot) => (slot.level === level ? { ...slot, current } : slot));
			return true;
		},
		setSpellGrantUseConfig: async () => false,
		setSpeciesSpellcastingAbility: () => {},
		add: () => {},
		remove: () => {},
		change: () => {},
		present: () => {},
		rollEffect: () => {},
		cast: () => {}
	};
	function saveAndReload() {
		savedSlots = slots.map((slot) => ({ ...slot }));
		slots = savedSlots.map((slot) => ({ ...slot }));
	}
</script>

<section data-testid="narrator-slot-controls">
	<CharacterSpellsTab
		newSpellName=""
		newSpellLevel={1}
		expandedSpell={null}
		isGM={true}
		canAdjustSlots={true}
		canCastSpells={false}
		speciesSpellcastingAbility=""
		hasSpeciesSpellGrants={false}
		castingSpell={null}
		{spellbook}
		{presentation}
		{actions}
	/>
</section>
<section data-testid="player-slot-controls">
	<CharacterSpellsTab
		newSpellName=""
		newSpellLevel={1}
		expandedSpell={null}
		isGM={false}
		canAdjustSlots={false}
		canCastSpells={false}
		speciesSpellcastingAbility=""
		hasSpeciesSpellGrants={false}
		castingSpell={null}
		{spellbook}
		{presentation}
		{actions}
	/>
</section>
<button type="button" data-testid="save-reopen-slots" onclick={saveAndReload}
	>Salvar e reabrir</button
>
<output data-testid="saved-slots">{JSON.stringify(savedSlots)}</output>
