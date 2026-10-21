// The text field of every form (TextField.vue, on useSmartInput): what it
// sends and when, what it shows while the save runs, and what it keeps of the
// user's typing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import TextField from '/imports/ui/components/global/TextField.vue';

const field = (props = {}, options = {}) => mount(TextField, {
  props: { modelValue: 'Goblin', label: 'Name', ...props },
  attachTo: document.body,
  ...options,
});
// The bar under the field shows while a save runs (it is there, hidden, the rest of the time)
const loading = wrapper => wrapper.find('.v-field__loader [role=progressbar]').attributes('aria-hidden') === 'false';
const messages = wrapper => wrapper.find('.v-messages').text();

describe('TextField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends what the user typed once they stop typing, and shows the save until it is acknowledged', async () => {
    const onChange = vi.fn();
    const wrapper = field({ onChange });
    const input = wrapper.find('input');
    expect(input.element.value).toBe('Goblin');

    await input.setValue('Hobgoblin');
    vi.advanceTimersByTime(700);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [value, acknowledge] = onChange.mock.calls[0];
    expect(value).toBe('Hobgoblin');
    await nextTick();
    expect(loading(wrapper)).toBe(true);

    acknowledge();
    await nextTick();
    expect(loading(wrapper)).toBe(false);
    expect(messages(wrapper)).toBe('');
  });

  it('shows the error the save answers, under the field', async () => {
    const onChange = vi.fn();
    const wrapper = field({ onChange });
    await wrapper.find('input').setValue('A name far too long');
    vi.advanceTimersByTime(750);
    onChange.mock.calls[0][1]({ reason: 'Name is too long' });
    await nextTick();
    expect(messages(wrapper)).toBe('Name is too long');
    expect(loading(wrapper)).toBe(false);
  });

  it('checks its rules first: a broken rule shows, and nothing is sent', async () => {
    const onChange = vi.fn();
    const wrapper = field({ onChange, rules: [value => value.length <= 6 || 'Six letters at most'] });
    await wrapper.find('input').setValue('Hobgoblin');
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
    await nextTick();
    expect(messages(wrapper)).toBe('Six letters at most');
  });

  it('keeps what the user is typing when the stored value changes meanwhile', async () => {
    const wrapper = field({ onChange: vi.fn() });
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Hob');
    // Another player renames it while this one types
    await wrapper.setProps({ modelValue: 'Orc' });
    expect(input.element.value).toBe('Hob');
  });

  it('follows the stored value while the user is elsewhere', async () => {
    const wrapper = field({ onChange: vi.fn() });
    await wrapper.setProps({ modelValue: 'Orc' });
    expect(wrapper.find('input').element.value).toBe('Orc');
  });

  it('sends a change still waiting as soon as the user leaves the field', async () => {
    const onChange = vi.fn();
    const wrapper = field({ onChange });
    const input = wrapper.find('input');
    await input.trigger('focus');
    await input.setValue('Bugbear');
    expect(onChange).not.toHaveBeenCalled();
    // A dialog's button clicked right after: its value must have left
    await input.trigger('blur');
    expect(onChange).toHaveBeenCalledWith('Bugbear', expect.any(Function));
  });

  it('sends a change still waiting when it closes', async () => {
    const onChange = vi.fn();
    const wrapper = field({ onChange });
    await wrapper.find('input').setValue('Bugbear');
    wrapper.unmount();
    expect(onChange).toHaveBeenCalledWith('Bugbear', expect.any(Function));
  });

  it('is read-only where the user may not edit', () => {
    const wrapper = field({}, { global: { provide: { context: { editPermission: false } } } });
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });
});
