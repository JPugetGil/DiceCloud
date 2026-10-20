// The version of the About page (AboutPage.vue), which the side menu links
// to: the number, the commit on GitHub and its date, in the user's language.
import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { Meteor } from 'meteor/meteor';
import AboutPage from '/imports/ui/pages/AboutPage.vue';
import i18n from '/imports/ui/i18n';

const about = () => mount(AboutPage, { attachTo: document.body });
const version = wrapper => wrapper.find('[data-id="app-version"]');

describe('The version on the About page', () => {
  afterEach(() => {
    delete Meteor.settings.public.appVersion;
  });

  it('gives the number, the commit and its date', () => {
    Meteor.settings.public.appVersion = { version: '3.1.0', commit: 'abcdef12', date: '2026-10-20T15:47:24+02:00' };
    const wrapper = about();
    expect(wrapper.find('#version').text()).toBe('Version');
    expect(version(wrapper).text()).toBe('DiceCloud 3.1.0, commit abcdef12 of October 20, 2026.');
    expect(version(wrapper).find('a').attributes('href')).toBe('https://github.com/JPugetGil/DiceCloud/commit/abcdef12');
  });

  it('speaks the user\'s language', () => {
    i18n.global.locale.value = 'fr';
    Meteor.settings.public.appVersion = { version: '3.1.0', commit: 'abcdef12', date: '2026-10-20T15:47:24+02:00' };
    expect(version(about()).text()).toBe('DiceCloud 3.1.0, commit abcdef12 du 20 octobre 2026.');
  });

  it('says nothing when the server could not read it', () => {
    const wrapper = about();
    expect(wrapper.find('#version').exists()).toBe(false);
    expect(version(wrapper).exists()).toBe(false);
  });
});
