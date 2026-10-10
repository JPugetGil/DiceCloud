import { Meteor } from 'meteor/meteor';
import { WebAppInternals } from 'meteor/webapp';
import type { Mongo } from 'meteor/mongo';
import {
  characterPreview, libraryPreview, previewHead, sitePreview, type CharacterSummary, type Preview,
} from '/imports/api/linkPreviews/linkPreview';

/*
 * Link previews (D1), written into the HTML the server sends for every page:
 * Discord's crawler (like the others) runs no script, so the tags must be
 * there before the app starts. A boilerplate data callback of Meteor's
 * webapp, which server-render's onPageLoad is built on, adds them to the
 * page's head after its own tags, without a package more. The app is the
 * same single-page app whatever the head holds; webapp builds this HTML for
 * each request (nothing caches it but the service worker, for offline use)
 * and sends it without a Cache-Control, which Cloudflare does not cache.
 *
 * A character's page shows the character only when it is public: the
 * crawler is anyone. Otherwise, as on any other page, DiceCloud's own
 * preview, with nothing of the character, not even whether it exists.
 */

const CHARACTER_PATH = /^\/character\/([A-Za-z0-9]{1,32})(?:\/[^/]*)?\/?$/;
const LIBRARY_PATH = /^\/library\/([A-Za-z0-9]{1,32})\/?$/;

// The collections, imported when used: this module loads with the server's
// startup, before some of them are defined
const collections = async () => ({
  Creatures: (await import('/imports/api/creature/creatures/Creatures')).default,
  CreatureProperties: (await import('/imports/api/creature/creatureProperties/CreatureProperties')).default,
  CreatureVariables: (await import('/imports/api/creature/creatures/CreatureVariables')).default,
  Libraries: (await import('/imports/api/library/Libraries')).default,
});

// The language of the request, when the crawler sends one: French or English
function requestLanguage(headers?: Record<string, string | string[] | undefined>): string | undefined {
  const accepted = String(headers?.['accept-language'] || '').toLowerCase();
  return accepted.startsWith('fr') ? 'fr' : undefined;
}

async function ownerLanguage(userId?: string): Promise<string | undefined> {
  if (!userId) return undefined;
  const user = await Meteor.users.findOneAsync(userId, { fields: { 'preferences.language': 1 } });
  return (user as { preferences?: { language?: string } } | undefined)?.preferences?.language;
}

/**
 * What a public character's preview shows, found as its sheet finds it: the
 * race (a `race` variable, else the subrace or race the libraries tag), the
 * classes, the hit points and the armor class. Undefined for a character that
 * is not public, or not there
 */
export async function characterSummary(creatureId: string): Promise<CharacterSummary | undefined> {
  const { Creatures, CreatureProperties, CreatureVariables } = await collections();
  const creature = await Creatures.findOneAsync({ _id: creatureId, public: true }, {
    fields: { name: 1, color: 1, picture: 1, avatarPicture: 1, owner: 1 },
  });
  if (!creature) return undefined;
  const active = {
    'root.id': creatureId, removed: { $ne: true }, inactive: { $ne: true }, overridden: { $ne: true },
  };
  const [variables, classes, tagged, stats] = await Promise.all([
    CreatureVariables.findOneAsync({ _creatureId: creatureId }, { fields: { race: 1 } }),
    CreatureProperties.find({ ...active, type: 'class' }, { fields: { name: 1, level: 1 }, sort: { left: 1 } }).fetchAsync(),
    CreatureProperties.find({ ...active, tags: { $in: ['race', 'subrace'] } }, { fields: { name: 1, tags: 1 }, sort: { left: 1 } }).fetchAsync(),
    CreatureProperties.find({
      ...active,
      $or: [{ type: 'attribute', attributeType: 'healthBar' }, { variableName: 'armor' }],
    }, { fields: { variableName: 1, attributeType: 1, value: 1, total: 1 }, sort: { left: 1 } }).fetchAsync(),
  ]);
  const raceVariable = (variables as { race?: { value?: { value?: unknown } } } | undefined)?.race?.value?.value;
  // A subrace says more ("High Elf")
  const raceProperty = tagged.find(prop => prop.tags?.includes('subrace')) || tagged[0];
  const healthBars = stats.filter(prop => prop.attributeType === 'healthBar');
  const hitPoints = healthBars.find(prop => prop.variableName === 'hitPoints') || healthBars[0];
  const armor = stats.find(prop => prop.variableName === 'armor');
  return {
    creature,
    race: typeof raceVariable === 'string' ? raceVariable : raceProperty?.name,
    classes: classes.map(cls => ({ name: cls.name, level: cls.level })),
    ...hitPoints && { hitPoints: { value: hitPoints.value, total: hitPoints.total } },
    ...Number.isFinite(armor?.value) && { armorClass: armor?.value },
    language: await ownerLanguage(creature.owner),
  };
}

/** The preview of the page at `path` */
export async function pagePreview(path: string, headers?: Record<string, string | string[] | undefined>): Promise<Preview> {
  const siteUrl = Meteor.absoluteUrl();
  const url = Meteor.absoluteUrl(path.replace(/^\/+/, ''));
  const language = requestLanguage(headers);
  try {
    const character = CHARACTER_PATH.exec(path)?.[1];
    if (character) {
      const summary = await characterSummary(character);
      if (summary) return characterPreview(summary, { siteUrl, url: Meteor.absoluteUrl(`character/${character}`) });
    }
    const libraryId = LIBRARY_PATH.exec(path)?.[1];
    if (libraryId) {
      const Libraries = (await collections()).Libraries as unknown as Mongo.Collection<{ _id: string, name?: string, description?: string }>;
      const library = await Libraries.findOneAsync({ _id: libraryId, public: true }, { fields: { name: 1, description: 1 } });
      if (library) return libraryPreview(library, { siteUrl, url, language });
    }
  } catch (e) {
    // A page never fails for its preview
    console.error(e);
  }
  return sitePreview({ siteUrl, language });
}

WebAppInternals.registerBoilerplateDataCallback('linkPreviews', async (request: any, data: any) => {
  data.dynamicHead = `${data.dynamicHead || ''}\n${previewHead(await pagePreview(request.path || '/', request.headers))}`;
  return true;
});
