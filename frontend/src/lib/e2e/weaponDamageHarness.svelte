<script lang="ts">
	import { onMount } from 'svelte';
	import WeaponDamageBuilder from '$lib/components/character/WeaponDamageBuilder.svelte';
	import {
		parseDamageExpression,
		serializeDamageComponents,
		validateDamageComponents,
		type DamageComponent
	} from '$lib/utils/weaponDamageBuilder';

	type Profile = 'base' | 'alternate';
	let base = $state<DamageComponent[]>([]);
	let alternate = $state<DamageComponent[]>([]);
	let saved = $state<Record<Profile, string> | null>(null);
	let hydrated = $state(false);
	const componentsFor = (profile: Profile) => (profile === 'base' ? base : alternate);
	const formulaFor = (profile: Profile) => serializeDamageComponents(componentsFor(profile));
	const reportFor = (profile: Profile) => ({
		profile,
		components: componentsFor(profile).map(({ count, sides }) => ({
			count,
			countType: typeof count,
			sides,
			sidesType: typeof sides
		})),
		formula: formulaFor(profile),
		validation: validateDamageComponents(componentsFor(profile))
	});
	function update(profile: Profile, components: DamageComponent[]) {
		if (profile === 'base') base = components;
		else alternate = components;
	}
	function saveAndReload() {
		saved = { base: formulaFor('base'), alternate: formulaFor('alternate') };
		base = parseDamageExpression(saved.base) ?? [];
		alternate = parseDamageExpression(saved.alternate) ?? [];
	}
	onMount(() => (hydrated = true));
</script>

<output data-testid="hydrated">{hydrated}</output>
{#each ['base', 'alternate'] as profile (profile)}
	<section data-profile={profile}>
		<p data-testid={`${profile}-formula`}>Fórmula: {formulaFor(profile as Profile)}</p>
		<WeaponDamageBuilder
			identifier={`diagnostic-${profile}`}
			components={componentsFor(profile as Profile)}
			error={validateDamageComponents(componentsFor(profile as Profile))?.message ?? ''}
			onchange={(components) => update(profile as Profile, components)}
		/>
		<pre data-testid={`${profile}-report`}>{JSON.stringify(reportFor(profile as Profile))}</pre>
	</section>
{/each}
<button type="button" data-testid="save-reload" onclick={saveAndReload}>Salvar e recarregar</button>
<pre data-testid="saved">{JSON.stringify(saved)}</pre>
