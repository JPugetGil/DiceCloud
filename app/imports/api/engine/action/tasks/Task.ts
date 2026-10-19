import type { CreatureProperty, CreaturePropertyTypes } from '/imports/api/creature/creatureProperties/CreatureProperties';
import type { CheckParams } from '/imports/api/engine/action/functions/userInput/InputProvider';

type Task = PropTask | DamagePropTask | DealDamageTask | ItemAsAmmoTask | CheckTask | ResetTask | CastSpellTask
  | TurnEventTask | ReceivedDamageTask | UndoReceivedTask;

export default Task;

type BaseTask = {
  targetIds: string[];
  silent?: boolean | undefined;
}

export type PropTask = BaseTask & {
  prop: CreatureProperty;
  subtaskFn?: undefined;
  silent?: undefined;
}

export type DamagePropTask = BaseTask & {
  subtaskFn: 'damageProp';
  params: {
    /**
     * Use getPropertyTitle(prop) to set the title
     */
    title?: string;
    operation: 'increment' | 'set';
    value: number;
    targetProp: CreatureProperty | { name: string, };
    // The type of the damage (or 'healing') it comes from, when a damage
    // dealt it (dealDamage): its triggers read it as `~damageType`
    damageType?: string;
  };
}

/**
 * Damage or healing dealt to a creature as a whole, as a damage property deals
 * it: through its health bars in their damage (or healing) order, temporary
 * hit points first, with its damage triggers. The health bar's Damage and
 * Healing buttons (UX1)
 */
export type DealDamageTask = BaseTask & {
  subtaskFn: 'dealDamage';
  // One and only one target
  targetIds: [string];
  params: {
    amount: number;
    // 'healing', a damage type ('slashing'...), or none for untyped damage
    damageType?: string;
  };
}

export type ItemAsAmmoTask = BaseTask & {
  subtaskFn: 'consumeItemAsAmmo';
  prop: CreatureProperty;
  silent?: undefined;
  params: {
    value: number;
    item: any;
    skipChildren: boolean;
  };
}

export type CheckTask = BaseTask & CheckParams & {
  subtaskFn: 'check';
}

export type ResetTask = BaseTask & {
  subtaskFn: 'reset';
  eventName: string;
  // One and only one target
  targetIds: [string];
}

/**
 * A creature's turn starts or ends in a party's initiative tracker: its
 * effects lose a round (at the start), its triggers of that event fire, and
 * what resets on that event resets (applyTurnEventTask). The server alone
 * makes this task, for the creatures of the tracker (runTurnEvent):
 * taskFromDatabase refuses it, so a client can never send it
 */
export type TurnEventTask = BaseTask & {
  subtaskFn: 'turnEvent';
  eventName: TurnEventName;
  // One and only one target: the creature whose turn it is, or with
  // `anchoredOn`, a creature holding effects anchored on that one's turns
  targetIds: [string];
  // Whether its effects count a round down: the party's choice (trackDurations)
  countDurations?: boolean;
  // The creatures with turns in the party's tracker: an effect anchored on
  // one of them follows its turns, and its holder's otherwise
  // (durationClockOf, phase 3.5)
  sourcesWithTurns?: string[];
  // The creature whose turn it is, when it is another than the target: only
  // the target's effects anchored on that creature's turns count down; no
  // trigger fires, nothing resets (phase 3.5)
  anchoredOn?: string;
}

export type TurnEventName = 'turnStart' | 'turnEnd';

/** A change another creature's action made to one of a creature's attributes */
export type ReceivedDamage = {
  targetId: string;
  propId: string;
  operation: 'increment' | 'set';
  // As its triggers read it: damage when positive, healing when negative
  value: number;
  // The damage's type, when a damage dealt it: `~damageType` for its triggers
  damageType?: string;
};

/**
 * Another creature's action changed some of a creature's attributes: its own
 * damage triggers fire, on its behalf (applyReceivedDamageTask). The server
 * alone makes this task, once that action is written (writeActionResults):
 * taskFromDatabase refuses it, so a client can never send it
 */
export type ReceivedDamageTask = BaseTask & {
  subtaskFn: 'receivedDamage';
  // One and only one target: the creature whose attributes changed
  targetIds: [string];
  params: { changes: Omit<ReceivedDamage, 'targetId'>[] };
}

/**
 * What another creature's action did to a creature's attributes, undone
 * (phase 2.4, revertReceived): each change's opposite, applied by the
 * creature to itself through damageProp, which keeps the attribute's limits
 * and fires its own damage triggers. The server alone makes this task, from
 * a received log entry: taskFromDatabase refuses it, so a client can never
 * send it
 */
export type UndoReceivedTask = BaseTask & {
  subtaskFn: 'undoReceived';
  // One and only one target: the creature itself
  targetIds: [string];
  // The damage to add to each attribute: negative gives back what was taken
  params: { changes: { propId: string, value: number }[] };
}

export type CastSpellTask = BaseTask & {
  prop: CreaturePropertyTypes['spell'];
  silent?: undefined;
  subtaskFn: 'castSpell';
  params: {
    slotId: string | undefined;
    ritual: boolean | undefined;
    withoutSpellSlot: boolean | undefined;
  };
}
