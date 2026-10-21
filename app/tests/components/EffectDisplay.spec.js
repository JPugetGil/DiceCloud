// How an effect reads (utility/effectDisplay.js), and the effect viewer that
// shows it: four copies of it knew no "set", whose effect showed its pin and
// no number (found comparing them, 2026-10-21).
import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { computed } from 'vue';

// The user's units read their account and the creature's attributes (the
// collections): metric here, no unit
vi.mock('/imports/ui/composables/useUnits', () => ({
  default: () => ({ formatQuantity: value => (value === undefined ? '' : String(value)) }),
  useEffectUnit: () => computed(() => undefined),
}));
// The viewer's fields show inline effects, which look theirs up: none here
vi.mock('/imports/api/creature/creatureProperties/CreatureProperties', () => ({
  default: { find: () => ({ fetch: () => [] }), findOne: () => undefined },
}));
import { effectDisplayedValue, effectOperationName } from '/imports/ui/utility/effectDisplay';
import EffectViewer from '/imports/ui/properties/viewers/EffectViewer.vue';

const t = key => `[${key}]`;

describe('Effects: their number and their operation', () => {
  it('shows the value a "set" sets', () => {
    expect(effectDisplayedValue('set', 10)).toBe(10);
    expect(effectOperationName('set', t)).toBe('[effectOps.set]');
  });

  it('shows an addition\'s size, the icon giving its sign; a typed formula as it is', () => {
    expect(effectDisplayedValue('add', -3)).toBe(3);
    expect(effectDisplayedValue('add', '-2')).toBe(2);
    expect(effectDisplayedValue('passiveAdd', 5)).toBe(5);
    expect(effectDisplayedValue('add', 'strengthMod')).toBe('strengthMod');
    expect(effectDisplayedValue('add', undefined)).toBeUndefined();
  });

  it('shows no number for an operation without one', () => {
    for (const operation of ['advantage', 'disadvantage', 'fail', 'conditional', undefined]) {
      expect(effectDisplayedValue(operation, 4)).toBeUndefined();
    }
  });

  it('shows a "set" effect\'s value in its viewer', () => {
    const wrapper = mount(EffectViewer, {
      props: { model: { _id: 'e1', type: 'effect', operation: 'set', amount: { calculation: '10', value: 10 }, stats: ['strength'] } },
      attachTo: document.body,
    });
    expect(wrapper.text()).toContain('10');
    expect(wrapper.text()).toContain('Set');
  });
});
