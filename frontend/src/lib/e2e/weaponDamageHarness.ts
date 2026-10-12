import { mount } from 'svelte';
import WeaponDamageBuilderHarness from './weaponDamageHarness.svelte';

document.body.replaceChildren();
const target = document.createElement('main');
document.body.append(target);
mount(WeaponDamageBuilderHarness, { target });
