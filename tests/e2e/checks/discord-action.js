#!/usr/bin/env node
/**
 * Discord's /action (decisions of 16 October), against the local fake of
 * Discord only, which sends the interactions to the server's endpoint as
 * Discord does, signed with its test key. The test account makes a board
 * that the other test account joins with its character, adds a goblin of the
 * SRD 5.1 bestiary given distinctive hit points, armor class and Dexterity
 * save, and starts a fight. The player links their Discord account (the
 * fake's authorization page), then from Discord: /action, by autocompletion,
 * with an attack — the target menu opens by itself and offers the goblin;
 * its advantage is never asked — and the result is posted in the channel,
 * "Hit!" and the damage dealt; with the advantage option, "(Advantage)"; a
 * spell with a saving throw — the target, the spell slot — whose result says
 * "<goblin> · Failed save", without the goblin's roll.
 * Nothing that left for Discord, nor any frame the player's browser received
 * meanwhile, holds the goblin's numbers. The game master then turns "Players
 * target the monsters" off: /action refuses the goblin, for the player alone;
 * a menu cancelled does nothing. Everything is put back.
 *
 * Needs a development server that posts to the fake, with a Discord
 * application and the fake's public key in its settings (see
 * discord-interactions.js), and the SRD 5.1 bestiary in its database.
 * Otherwise the check says so and skips: nothing reaches Discord.
 */
const { openPage, visit, BASE_URL } = require('../lib/browser');
const { withDb } = require('../lib/db');
const { USERNAME } = require('../lib/config');
const { createChecker, main } = require('../lib/check');
const { startFakeDiscord, INTERACTIONS_PUBLIC_KEY } = require('../lib/fakeDiscord');

const OTHER = `${USERNAME}-other`;
const BESTIARY = 'SRD 5.1 Bestiary';
const SEAL = 'E2E SECRET SEAL';
const PLAYER = '1400000000000000342';
const GUILD = '1500000000000000301';
const CHANNEL = '1500000000000000302';
const APP = '1600000000000000001';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(condition, what, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await condition();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await pause(200);
  }
}

/** Calls a method as the page's user, through the app */
function caller(page) {
  return async (name, args) => {
    const result = await page.evaluate(({ name, args }) => window.Meteor.callAsync(name, args)
      .then(value => ({ value }), e => ({ error: e.reason || e.message })), { name, args });
    await pause(1200);
    if (result.error) throw new Error(`${name}: ${result.error}`);
    return result.value;
  };
}

/** Every DDP frame the page receives from now on */
function recordFrames(page) {
  const frames = [];
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => frames.push(String(payload))));
  return frames;
}

const prop = (query, projection = {}) => withDb(db => db.collection('creatureProperties').findOne(
  { removed: { $ne: true }, ...query }, { projection },
));

main(async () => {
  const data = await withDb(async db => {
    const gm = await db.collection('users').findOne({ username: USERNAME }, { projection: { subscribedLibraries: 1 } });
    const player = await db.collection('users').findOne({ username: OTHER }, { projection: { _id: 1 } });
    const bestiary = await db.collection('libraries').findOne({ name: BESTIARY }, { projection: { _id: 1 } });
    const goblin = bestiary && await db.collection('libraryNodes').findOne(
      { 'root.id': bestiary._id, type: 'creature', name: 'Goblin', removed: { $ne: true } }, { projection: { _id: 1 } },
    );
    const character = player && await db.collection('creatures').findOne(
      { owner: player._id, type: 'pc' }, { projection: { _id: 1, name: 1 } },
    );
    return { gm, player, bestiary, goblin, character };
  });
  const { step, finish } = createChecker('Discord\'s /action: a player\'s attack and spell on the game master\'s goblin (against the fake)');
  if (!data.bestiary || !data.goblin || !data.player || !data.character) {
    await step('the bestiary and the other test account\'s character are in the database', null, () => {
      throw new Error('import the bestiary (tools/libraryImport) and run "npm run setup" first');
    });
    return finish();
  }
  const characterId = data.character._id;
  const alreadyFollowed = (data.gm.subscribedLibraries || []).includes(data.bestiary._id);
  const endpoint = `${BASE_URL}/discord/interactions`;

  const gm = await openPage();
  const browsers = [gm.browser];
  await visit(gm.page, '/character-list', 3000);
  const call = caller(gm.page);
  let fake;
  try {
    fake = await startFakeDiscord();
    const ready = await gm.page.evaluate(async () => ({
      base: await window.Meteor.callAsync('discord.testApi').catch(() => null),
      interactions: !!window.Meteor.settings.public.discordInteractions,
    }));
    const ping = ready.base === fake.baseUrl && ready.interactions ? await fake.interact(endpoint, { type: 1 }) : undefined;
    if (ping?.answer?.type !== 1) {
      const posts = ready.base === fake.baseUrl;
      await fake.close();
      fake = undefined;
      await step('skipped: the server takes no interactions signed with the fake\'s key', null, async () => (
        `posts to the fake: ${posts ? 'yes' : 'no'}; interactions: ${ready.interactions ? 'yes' : 'no'}; `
        + `PING: ${ping ? ping.status : '–'} (discord.publicKey ${INTERACTIONS_PUBLIC_KEY.slice(0, 8)}…, see the README)`));
      await gm.browser.close();
      return finish();
    }
  } catch (e) {
    await gm.browser.close();
    throw e;
  }

  const where = { application_id: APP, guild_id: GUILD, channel_id: CHANNEL, locale: 'en-US', member: { user: { id: PLAYER } } };
  // A user has 8 actions per 10 seconds: past them, the check waits as a user would
  const send = async payload => {
    const sent = await fake.interact(endpoint, payload);
    if (!/Too many/.test(sent.answer?.data?.content || '')) return sent;
    await pause(10500);
    return fake.interact(endpoint, payload);
  };
  const option = (name, value, type = 3) => ({ name, type, value });
  const command = (options, locale = 'en-US') => send({ type: 2, ...where, locale, data: { name: 'action', options: [...options, option('character', characterId)] } });
  const click = (customId, values) => send({
    type: 3, ...where, message: { id: '1800000000000000301', flags: 64 },
    data: { custom_id: customId, component_type: values ? 3 : 2, ...values && { values } },
  });
  const components = message => (message?.components || []).flatMap(row => row.components || []);
  const selectOf = message => components(message).find(component => component.type === 3);
  const buttonOf = (message, label) => {
    const found = components(message).find(component => component.type === 2 && component.label === label);
    if (!found) throw new Error(`no "${label}" in ${JSON.stringify(components(message).map(component => component.label || component.placeholder))}`);
    return found.custom_id;
  };
  const resultOf = token => waitFor(() => fake.interactions.get(token)?.followUps[0], 'the result');

  let player;
  let callAsPlayer;
  let folderId;
  let goblinId;
  let goblinName;
  let linked = false;
  let frames = [];
  const secrets = [SEAL];
  const playerPropIds = [];
  let strikeId;
  let frostId;
  let slot2Id;
  try {
    await step('a board with the other account\'s character and a goblin with distinctive numbers, in a fight', gm.messages, async () => {
      if (!alreadyFollowed) await call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: true });
      folderId = await call('creatureFolders.methods.insert', {});
      await call('creatureFolders.methods.updateName', { _id: folderId, name: 'E2E Discord action' });
      const token = await call('creatureFolders.party.createInvite', { folderId });
      player = await openPage({ username: OTHER });
      browsers.push(player.browser);
      callAsPlayer = caller(player.page);
      await visit(player.page, '/character-list', 3000);
      await callAsPlayer('creatureFolders.party.join', { token, creatureIds: [characterId] });
      await call('creatureFolders.monsters.add', { folderId, nodeId: data.goblin._id, count: 1 });
      goblinId = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).creatures
        .find(id => id !== characterId));
      if (!goblinId) throw new Error('no goblin on the board');
      goblinName = (await withDb(db => db.collection('creatures').findOne({ _id: goblinId }, { projection: { name: 1 } }))).name;
      const hitPoints = await prop({ 'root.id': goblinId, variableName: 'hitPoints', attributeType: 'healthBar' });
      const armor = await prop({ 'root.id': goblinId, variableName: 'armor', type: 'attribute' });
      await call('creatureProperties.update', { _id: hitPoints._id, path: ['baseValue', 'calculation'], value: '31415' });
      await call('creatureProperties.update', { _id: armor._id, path: ['baseValue', 'calculation'], value: '27182' });
      await call('creatureProperties.insert', {
        creatureProperty: { type: 'effect', name: 'E2E Clumsy', operation: 'add', amount: { calculation: '-16180' }, stats: ['dexteritySave'] },
        parentRef: { collection: 'creatures', id: goblinId },
      });
      await call('creatureProperties.insert', {
        creatureProperty: { type: 'buff', name: SEAL, tags: ['magic'] },
        parentRef: { collection: 'creatures', id: goblinId },
      });
      await visit(gm.page, `/character/${goblinId}`, 4000);
      const computed = await waitFor(async () => {
        const [hp, ac, save] = await Promise.all([
          prop({ _id: hitPoints._id }, { total: 1 }),
          prop({ _id: armor._id }, { value: 1 }),
          prop({ 'root.id': goblinId, variableName: 'dexteritySave' }, { value: 1 }),
        ]);
        return hp?.total >= 31415 && ac?.value >= 27182 && save?.value <= -16000 && { hp: hp.total, ac: ac.value, save: save.value };
      }, 'the goblin computed', 20000);
      secrets.push(String(computed.hp), String(computed.ac), String(Math.abs(computed.save)));
      // The player's attack, and a spell with a saving throw, cast with a slot of level 1 or 2
      const insert = async (creatureProperty, parent = { collection: 'creatures', id: characterId }) => callAsPlayer(
        'creatureProperties.insert', { creatureProperty, parentRef: parent },
      );
      strikeId = await insert({ type: 'action', name: 'E2E Strike', target: 'singleTarget', attackRoll: { calculation: '30000' } });
      const hit = await insert({ type: 'branch', branchType: 'hit' }, { collection: 'creatureProperties', id: strikeId });
      await insert({ type: 'damage', target: 'target', damageType: 'slashing', amount: { calculation: '7' } }, { collection: 'creatureProperties', id: hit });
      frostId = await insert({ type: 'spell', name: 'E2E Frost', level: 1, prepared: true, target: 'singleTarget' });
      const save = await insert({
        type: 'savingThrow', name: 'E2E Frost', target: 'target', dc: { calculation: '15' }, stat: 'dexteritySave',
      }, { collection: 'creatureProperties', id: frostId });
      const failed = await insert({ type: 'branch', branchType: 'failedSave' }, { collection: 'creatureProperties', id: save });
      await insert({ type: 'damage', target: 'target', damageType: 'cold', amount: { calculation: '3' } }, { collection: 'creatureProperties', id: failed });
      const slot1Id = await insert({
        type: 'attribute', attributeType: 'spellSlot', name: 'E2E slots 1', variableName: 'eTwoESlotOne',
        spellSlotLevel: { calculation: '1' }, baseValue: { calculation: '2' },
      });
      slot2Id = await insert({
        type: 'attribute', attributeType: 'spellSlot', name: 'E2E slots 2', variableName: 'eTwoESlotTwo',
        spellSlotLevel: { calculation: '2' }, baseValue: { calculation: '2' },
      });
      playerPropIds.push(strikeId, frostId, slot1Id, slot2Id);
      // Computed on the player's sheet
      await visit(player.page, `/character/${characterId}`, 4000);
      await waitFor(async () => (await prop({ _id: slot2Id }, { value: 1 }))?.value === 2, 'the slots computed');
      // The fight: the character first
      await call('creatureFolders.initiative.addCreatures', { folderId, creatureIds: [characterId, goblinId] });
      const { entries } = await withDb(async db => (await db.collection('creatureFolders').findOne({ _id: folderId })).initiative);
      for (const entry of entries) {
        await call('creatureFolders.initiative.update', { folderId, entryId: entry._id, initiative: entry.creatureId === characterId ? 20 : 10 });
      }
      await call('creatureFolders.initiative.advance', { folderId, step: 1 });
      return `${goblinName}: ${computed.hp} hit points, armor class ${computed.ac}, Dexterity save ${computed.save}`;
    });

    await step('the player links their Discord account', player.messages, async () => {
      if (await withDb(db => db.collection('users').countDocuments({ 'discordAccount.id': PLAYER }))) {
        throw new Error('another account has the test Discord id');
      }
      fake.authorizeAs({ user: { id: PLAYER, username: 'e2e_action' } });
      await visit(player.page, '/account', 3000);
      await player.page.click('[data-id="discord-link"]');
      await player.page.waitForURL(url => url.pathname === '/account', { timeout: 20000 });
      await player.page.waitForSelector('[data-id="discord-account-linked"]', { timeout: 10000 });
      linked = true;
      // The player's browser, on the sheet, from now on
      frames = recordFrames(player.page);
      await visit(player.page, `/character/${characterId}`, 4000);
    });

    await step('/action, by autocompletion: the target menu offers the goblin; no advantage asked; "Hit!" and the damage are posted', null, async () => {
      const choices = (await send({
        type: 4, ...where, data: { name: 'action', options: [{ ...option('action', 'E2E Str'), focused: true }, option('character', characterId)] },
      })).answer.data.choices;
      const choice = choices.find(item => item.value === strikeId);
      if (!choice) throw new Error(`choices ${JSON.stringify(choices)}`);
      // A natural 1 misses whatever the bonus: then the player attacks again
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const { answer } = await command([option('action', choice.value)]);
        if (answer.type !== 4 || answer.data.flags !== 64) throw new Error(`answered ${JSON.stringify(answer).slice(0, 300)}`);
        const select = selectOf(answer.data);
        if (!select?.options.some(item => item.value === goblinId)) throw new Error(`the menu: ${JSON.stringify(answer.data).slice(0, 300)}`);
        const rolled = await click(select.custom_id, [goblinId]);
        if (rolled.answer.type !== 7 || !/on its way/.test(rolled.answer.data.content)) throw new Error(JSON.stringify(rolled.answer).slice(0, 300));
        const card = await resultOf(rolled.token);
        const text = JSON.stringify(card);
        if (card.flags & 64) throw new Error('the result is not public');
        if (/Critical miss/.test(text)) continue;
        if (!/Hit!|Critical hit!/.test(text) || !/\*\*7\*\* (critical )?slashing damage/.test(text)) throw new Error(text.slice(0, 400));
        if (/Advantage/.test(text)) throw new Error('with advantage, which nothing gave it');
        return `"${choice.name}": ${select.options.length} targets offered, then "${rolled.answer.data.content}"; posted`;
      }
      throw new Error('three critical misses in a row');
    });

    await step('/action with the advantage option: the roll with advantage', null, async () => {
      const { answer } = await command([option('action', 'E2E Strike'), option('advantage', 1, 4)]);
      const rolled = await click(selectOf(answer.data).custom_id, [goblinId]);
      const text = JSON.stringify(await resultOf(rolled.token));
      if (!/(Hit!|Critical hit!|Critical miss!) \(Advantage\)/.test(text)) throw new Error(text.slice(0, 400));
      return 'posted with "(Advantage)"';
    });

    await step('a spell: the target, the spell slot; "<goblin> · Failed save" posted, without the goblin\'s roll', null, async () => {
      const { answer } = await command([option('action', 'E2E Frost')]);
      const targeted = await click(selectOf(answer.data).custom_id, [goblinId]);
      const slots = selectOf(targeted.answer.data);
      if (!/spell slot/.test(targeted.answer.data.content) || !slots?.options.some(item => item.value === slot2Id)) {
        throw new Error(`the slot menu: ${JSON.stringify(targeted.answer.data).slice(0, 400)}`);
      }
      const cast = await click(slots.custom_id, [slot2Id]);
      const text = JSON.stringify(await resultOf(cast.token));
      if (!text.includes(`${goblinName} · Failed save`) || !text.includes('Casting using a level 2 spell slot')) throw new Error(text.slice(0, 400));
      if (/1d20/.test(text)) throw new Error('a roll in the result: the spell rolls none of its own');
      const left = await waitFor(async () => (await prop({ _id: slot2Id }, { value: 1 }))?.value === 1, 'a level 2 slot spent');
      return `${slots.options.map(item => item.label).join(', ')}; a level 2 slot spent: ${left}`;
    });

    await step('nothing that left for Discord, nor the player\'s browser, holds the goblin\'s numbers', null, async () => {
      const left = (await prop({ 'root.id': goblinId, variableName: 'hitPoints', attributeType: 'healthBar' }, { value: 1 }))?.value;
      if (!(left < 31415)) throw new Error(`the goblin's hit points: ${left}`);
      secrets.push(String(left));
      const discord = JSON.stringify([
        ...[...fake.interactions.values()].map(record => [record.answer, record.original, record.edits, record.followUps]),
        ...fake.requests.map(request => request.body),
      ]).replace(/\{"\$date":\d+\}/g, '{}');
      const words = ['Hit Points', 'Armor Class'];
      const sent = [...secrets, ...words].filter(secret => discord.includes(secret));
      if (sent.length) throw new Error(`Discord received: ${sent.join(', ')}`);
      if (!frames.some(frame => frame.includes('E2E Frost'))) throw new Error('the character\'s entries never reached the browser: the search proves nothing');
      const bare = frames.map(frame => frame.replace(/\{\\*"\$date\\*":\d+\}/g, '{}'));
      const received = secrets.filter(secret => bare.some(frame => frame.includes(secret)));
      if (received.length) throw new Error(`the player's browser received: ${received.join(', ')}`);
      return `${fake.interactions.size} interactions, ${frames.length} frames, none with ${secrets.join(', ')}`;
    });

    await step('"Players target the monsters" off: /action refuses the goblin, for the player alone, in their language; a cancel does nothing', null, async () => {
      await call('creatureFolders.setPlayersTargetMonsters', { folderId, playersTargetMonsters: false });
      const refused = (await command([option('action', 'E2E Strike'), option('target', goblinId)], 'fr')).answer;
      if (refused.type !== 4 || refused.data.flags !== 64 || !/Vous ne pouvez pas cibler/.test(refused.data.content)) {
        throw new Error(JSON.stringify(refused).slice(0, 300));
      }
      // Nothing else to target: no target menu, as on the sheet; the spell's slot menu, cancelled
      const menu = (await command([option('action', 'E2E Frost')])).answer;
      if (menu.type !== 4 || !/spell slot/.test(menu.data.content) || selectOf(menu.data).options.some(item => item.value === goblinId)) {
        throw new Error(`the menu: ${JSON.stringify(menu).slice(0, 300)}`);
      }
      const before = await withDb(db => db.collection('creatureLogs').countDocuments({ creatureId: characterId }));
      const cancelled = (await click(buttonOf(menu.data, 'Cancel'))).answer;
      if (cancelled.type !== 7 || !/You gave up E2E Frost/.test(cancelled.data.content) || components(cancelled.data).length) {
        throw new Error(JSON.stringify(cancelled).slice(0, 300));
      }
      const after = await withDb(db => db.collection('creatureLogs').countDocuments({ creatureId: characterId }));
      if (after !== before) throw new Error('a cancelled action was logged');
      return `"${refused.data.content}" · "${cancelled.data.content}"`;
    });
  } finally {
    await step('everything is put back', null, async () => {
      const errors = [];
      const attempt = async action => {
        try {
          await action();
        } catch (e) {
          errors.push(e.message);
        }
      };
      // Unlinked through the app: /action's sessions and last targets go with it
      if (linked) await attempt(() => callAsPlayer('discord.unlink', {}));
      for (const _id of playerPropIds) await attempt(() => callAsPlayer('creatureProperties.softRemove', { _id }));
      if (goblinId) await attempt(() => call('creatureFolders.monsters.endEncounter', { folderId, endCombat: true }));
      if (folderId) {
        if (callAsPlayer) await attempt(() => callAsPlayer('creatureFolders.party.leave', { folderId }));
        await attempt(() => call('creatureFolders.methods.remove', { _id: folderId }));
      }
      if (!alreadyFollowed) await attempt(() => call('users.subscribeToLibrary', { libraryId: data.bestiary._id, subscribe: false }));
      const left = await withDb(async db => ({
        account: (await db.collection('users').findOne({ _id: data.player._id }, { projection: { discordAccount: 1 } }))?.discordAccount,
        sessions: await db.collection('discordActionSessions').countDocuments({ userId: data.player._id }),
        targets: await db.collection('discordActionTargets').countDocuments({ userId: data.player._id }),
        actions: await db.collection('actions').countDocuments({ creatureId: characterId }),
      }));
      if (left.account || left.sessions || left.targets || left.actions) throw new Error(`left: ${JSON.stringify(left)}; ${errors.join('; ')}`);
      if (errors.length) throw new Error(errors.join('; '));
    });
    await fake?.close();
    for (const browser of browsers) await browser.close().catch(() => {});
  }
  finish();
});
