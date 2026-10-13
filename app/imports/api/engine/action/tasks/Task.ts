import { CreatureProperty, CreaturePropertyTypes } from '/imports/api/creature/creatureProperties/CreatureProperties';
import { CheckParams } from '/imports/api/engine/action/functions/userInput/InputProvider';

type Task = PropTask | DamagePropTask | DealDamageTask | ItemAsAmmoTask | CheckTask | ResetTask | CastSpellTask
  | TurnEventTask;

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
  // One and only one target: the creature whose turn it is
  targetIds: [string];
  // Whether its effects count a round down: the party's choice (trackDurations)
  countDurations?: boolean;
}

export type TurnEventName = 'turnStart' | 'turnEnd';

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
