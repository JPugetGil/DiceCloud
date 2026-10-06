import SimpleSchema from 'meteor/aldeed:simple-schema';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import LogContentSchema from '/imports/api/creature/log/LogContentSchema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { assertEditPermission } from '/imports/api/creature/creatures/creaturePermissions';
import { parse, prettifyParseError } from '/imports/parser/parser';
import resolve from '/imports/parser/resolve';
import toString from '/imports/parser/toString';
import rollWithAdvantage from '/imports/api/creature/log/rollWithAdvantage';
import { logLine, msg } from '/imports/api/creature/log/logMessages';
import STORAGE_LIMITS from '/imports/constants/STORAGE_LIMITS';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';

const PER_CREATURE_LOG_LIMIT = 100;

if (Meteor.isServer) {
  // require(), not import: this module is only pulled in on one side of the
  // wire, and a static import would bundle it into both
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  var sendLogToDiscord = require('/imports/api/creature/log/server/discordWebhooks').sendLogToDiscord;
}

let CreatureLogs = new Mongo.Collection('creatureLogs');

let CreatureLogSchema = new SimpleSchema({
  content: {
    type: Array,
    defaultValue: [],
    maxCount: STORAGE_LIMITS.logContentCount,
  },
  'content.$': {
    type: LogContentSchema,
  },
  // The real-world date that it occured, usually sorted by date
  date: {
    type: Date,
    autoValue: function () {
      // If the date isn't set, set it to now
      if (!this.isSet) {
        return new Date();
      }
    },
    index: 1,
  },
  // The acting creature initiating the logged events
  creatureId: {
    type: String,
    index: 1,
  },
  // The action that caused this log entry
  actionId: {
    type: String,
    optional: true,
  },
  creatureName: {
    type: String,
    optional: true,
    max: STORAGE_LIMITS.name,
  },
});

CreatureLogs.attachSchema(CreatureLogSchema);

/**
 * Keep a creature's newest PER_CREATURE_LOG_LIMIT logs and remove older ones.
 * The character sheet is only ever sent the newest 20, and restoring an archive
 * keeps at most PER_CREATURE_LOG_LIMIT: without this the collection grew by a
 * document per action forever. Logs tied with the oldest one kept stay too, so
 * a shared timestamp never costs a recent log.
 */
export async function trimCreatureLogs(creatureId) {
  if (!creatureId) throw Error('Provide a creatureId');
  const oldestKept = await CreatureLogs.findOneAsync({ creatureId }, {
    sort: { date: -1 },
    skip: PER_CREATURE_LOG_LIMIT - 1,
    fields: { date: 1 },
  });
  if (!oldestKept) return;
  await CreatureLogs.removeAsync({ creatureId, date: { $lt: oldestKept.date } });
}

/**
 * Posts a log entry, once written, to its creature's Discord webhook if it has
 * one (server/discordWebhooks.ts). On the server only, and without waiting:
 * a method's simulation posts nothing, and a log never waits on Discord.
 */
export function postLogToDiscord(log) {
  if (Meteor.isServer) sendLogToDiscord(log);
}

/**
 * @param {{ log: any, method?: { unblock: () => void } }} args
 * The method writing it, if any, is unblocked once the log is in
 */
export async function insertCreatureLogWork({ log, method }) {
  // Build the new log
  if (typeof log === 'string') {
    log = { content: [{ value: log }] };
  }
  if (!log.content?.length) return;

  // Truncate the string lengths to fit the log content schema
  log.content.forEach((logItem) => {
    if (logItem.value?.length > STORAGE_LIMITS.summary) {
      logItem.value = logItem.value.substring(0, STORAGE_LIMITS.summary - 3) + '...';
    }
  });
  log.date = new Date();
  // Insert it
  let id = await CreatureLogs.insertAsync(log);
  if (Meteor.isServer) {
    method?.unblock();
    postLogToDiscord(log);
    await trimCreatureLogs(log.creatureId);
  }
  return id;
}

function equalIgnoringWhitespace(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return a === b;
  return a.replace(/\s/g, '') === b.replace(/\s/g, '');
}

const logRoll = new ValidatedMethod({
  name: 'creatureLogs.methods.logForCreature',
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  validate: new SimpleSchema({
    roll: {
      type: String,
    },
    creatureId: {
      type: String,
      max: 32,
      optional: true,
    },
    // The log's advantage toggle: 1 advantage, -1 disadvantage
    advantage: {
      type: SimpleSchema.Integer,
      allowedValues: [-1, 0, 1],
      optional: true,
    },
  }).validator(),
  async run({ roll: typedRoll, creatureId, advantage }) {
    if (!creatureId) throw new Meteor.Error('no-id',
      'A creature id must be given'
    );
    let creature;
    if (creatureId) {
      creature = await Creatures.findOneAsync(creatureId, {
        fields: {
          readers: 1,
          writers: 1,
          owner: 1,
        }
      });
      await assertEditPermission(creature, this.userId);
    }
    const variables = await CreatureVariables.findOneAsync({ _creatureId: creatureId }) || {};
    let logContent = []
    // With advantage, the first d20 becomes two: the log says so on the line
    // that gives the roll as typed
    const roll = rollWithAdvantage(typedRoll, advantage);
    const withAdvantage = roll !== typedRoll;
    if (withAdvantage) logContent.push(logLine({
      value: msg(advantage > 0 ? 'logs.withAdvantage' : 'logs.withDisadvantage', { name: typedRoll }),
    }));
    let parsedResult = undefined;
    try {
      parsedResult = parse(roll);
    } catch (e) {
      let error = prettifyParseError(e);
      logContent.push({ name: 'Parse error', i18n: { name: { key: 'logs.parseError' } }, value: error });
    }
    if (parsedResult) try {
      let {
        result: compiled,
        context
      } = await resolve('compile', parsedResult, variables);
      const compiledString = toString(compiled);
      if (!withAdvantage && !equalIgnoringWhitespace(compiledString, roll)) logContent.push({
        value: roll
      });
      // dropLowest(2d20) is the advantage line's business
      if (!withAdvantage) logContent.push({
        value: compiledString
      });
      let { result: rolled } = await resolve('roll', compiled, variables, context);
      let rolledString = toString(rolled);
      if (rolledString !== compiledString) logContent.push({
        value: rolledString
      });
      let { result } = await resolve('reduce', rolled, variables, context);
      let resultString = toString(result);
      if (resultString !== rolledString) logContent.push({
        value: resultString
      });
    } catch (e) {
      console.error(e);
      logContent = [{ name: 'Calculation error', i18n: { name: { key: 'logs.calculationError' } } }];
    }
    const log = {
      content: logContent,
      creatureId,
      date: new Date(),
    };

    let id = await insertCreatureLogWork({ log, method: this });

    return id;
  },
});

export default CreatureLogs;
export { CreatureLogSchema, logRoll, PER_CREATURE_LOG_LIMIT };
