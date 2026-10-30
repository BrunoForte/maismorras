import { mount } from 'svelte';
import SpellSlotControlsHarness from './spellSlotControlsHarness.svelte';

document.body.replaceChildren();
const target = document.createElement('main');
document.body.append(target);
mount(SpellSlotControlsHarness, { target });
