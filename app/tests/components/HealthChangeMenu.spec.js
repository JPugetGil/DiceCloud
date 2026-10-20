// The menu a health bar opens (HealthChangeMenu.vue): damage by default,
// healing and setting the bar, what it sends, and what it refuses.
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HealthChangeMenu from '/imports/ui/properties/components/attributes/HealthChangeMenu.vue';
import SmartToggle from '/imports/ui/components/global/SmartToggle.vue';
import i18n from '/imports/ui/i18n';

const menu = (props = {}) => mount(HealthChangeMenu, {
  props: { name: 'Hit Points', value: 12, open: true, ...props },
  global: { components: { SmartToggle } },
  attachTo: document.body,
});
const amount = wrapper => wrapper.find('[data-id="health-change-amount"] input');
const applyButton = wrapper => wrapper.find('[data-id="health-change-apply"]');
const modeButton = (wrapper, name) => wrapper.findAll('[data-id="health-change-mode"] button')
  .find(button => button.text() === name);
const hint = wrapper => wrapper.find('[data-id="health-change-amount"] .v-messages').text();

describe('HealthChangeMenu', () => {
  it('deals damage by default: 7, then Enter', async () => {
    const wrapper = menu();
    expect(hint(wrapper)).toBe('Temporary hit points go first, and the character\'s effects on damage apply.');
    await amount(wrapper).setValue('7');
    await amount(wrapper).trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('change')).toEqual([[{ mode: 'damage', value: 7, damageType: undefined }]]);
  });

  it('switches to healing with +, as the old menu\'s key did', async () => {
    const wrapper = menu();
    await amount(wrapper).trigger('keypress', { key: '+' });
    expect(hint(wrapper)).toBe('Restores hit points, up to their maximum.');
    await amount(wrapper).setValue('5');
    await applyButton(wrapper).trigger('click');
    expect(wrapper.emitted('change')).toEqual([[{ mode: 'healing', value: 5, damageType: 'healing' }]]);
  });

  it('sets the bar starting from its current value', async () => {
    const wrapper = menu();
    await modeButton(wrapper, 'Set').trigger('click');
    expect(amount(wrapper).element.value).toBe('12');
    expect(hint(wrapper)).toBe('This bar only, now 12.');
    await amount(wrapper).setValue('0');
    await applyButton(wrapper).trigger('click');
    expect(wrapper.emitted('change')).toEqual([[{ mode: 'set', value: 0, damageType: undefined }]]);
  });

  it('sends no damage of nothing, zero or less', async () => {
    const wrapper = menu();
    for (const typed of ['', '0', '-3']) {
      await amount(wrapper).setValue(typed);
      expect(applyButton(wrapper).attributes('disabled'), `"${typed}"`).toBeDefined();
      await amount(wrapper).trigger('keydown', { key: 'Enter' });
    }
    expect(wrapper.emitted('change')).toBeUndefined();
  });

  it('rounds a fraction down: 7.9 damage is 7', async () => {
    const wrapper = menu();
    await amount(wrapper).setValue('7.9');
    await applyButton(wrapper).trigger('click');
    expect(wrapper.emitted('change')).toEqual([[expect.objectContaining({ value: 7 })]]);
  });

  it('starts over each time it opens', async () => {
    const wrapper = menu();
    await amount(wrapper).trigger('keypress', { key: '+' });
    await amount(wrapper).setValue('5');
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    expect(amount(wrapper).element.value).toBe('');
    expect(hint(wrapper)).toMatch(/^Temporary hit points go first/);
  });

  it('speaks the user\'s language', async () => {
    i18n.global.locale.value = 'fr';
    const wrapper = menu();
    expect(modeButton(wrapper, 'Dégâts')).toBeDefined();
    expect(applyButton(wrapper).text()).toBe('Appliquer');
  });
});
