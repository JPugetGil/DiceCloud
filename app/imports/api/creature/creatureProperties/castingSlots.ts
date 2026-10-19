/*
 * What a spell is cast with, as the cast dialog offers it
 * (CastSpellWithSlotDialog.vue), and Discord's /action too: a spell slot of
 * its level or above with one left, or for a ritual its ritual casting; a
 * cantrip, or a spell cast without slots, with none. The slot itself is
 * spent by the engine (applyCastSpellTask), which checks it again.
 */

/** The spell slots a creature may cast with: active, of level 1 or more */
export const SPELL_SLOT_FILTER = Object.freeze({
  type: 'attribute',
  attributeType: 'spellSlot',
  removed: { $ne: true },
  inactive: { $ne: true },
  overridden: { $ne: true },
  'spellSlotLevel.value': { $gte: 1 },
});

/** The order the dialog lists them in: lowest level first */
export const SPELL_SLOT_SORT = Object.freeze({ 'spellSlotLevel.value': 1, order: 1 });

// The castings that are no slot of the creature's
export const NO_SLOT = 'no-slot';
export const RITUAL = 'ritual';

type Spell = { level?: number, ritual?: boolean, castWithoutSpellSlots?: boolean, insufficientResources?: boolean };
// An attribute's value, stored as SimpleSchema.oneOf(Number, String, Boolean)
type Slot = { _id: string, value?: unknown, spellSlotLevel?: { value?: unknown } };

/** Whether the spell may be cast with this slot (`slotId`: the slot's id, NO_SLOT or RITUAL) */
export function canCastSpellWithSlot(spell: Spell | undefined, slotId: string | undefined, slot?: Slot): boolean {
  if (slot && !slot.value) return false;
  if (!spell) return true;
  if (!slotId) return true;
  if (spell.castWithoutSpellSlots && spell.insufficientResources) return false;
  if (spell.ritual && slotId === RITUAL) return true;
  if (!spell.level || spell.castWithoutSpellSlots) {
    // Cantrips and no-slot spells
    return slotId === NO_SLOT;
  }
  // Levelled spells
  return slotId !== NO_SLOT && !!slot && (spell.level ?? 0) <= Number(slot.spellSlotLevel?.value ?? 0);
}

/**
 * What the dialog casts the spell with first: nothing for a cantrip or a
 * spell cast without slots, else the lowest slot it may be cast with, else
 * its ritual casting; undefined when none. `slots` in the dialog's order
 */
export function defaultCasting(spell: Spell, slots: Slot[]): string | undefined {
  if (spell.level === 0 || spell.castWithoutSpellSlots) return NO_SLOT;
  const slot = slots.find(candidate => canCastSpellWithSlot(spell, candidate._id, candidate));
  if (slot) return slot._id;
  if (spell.ritual) return RITUAL;
  return undefined;
}

/** The castSpell task's parameters of a casting */
export function castingParams(casting: string | undefined) {
  const ritual = casting === RITUAL;
  const withoutSpellSlot = casting === NO_SLOT;
  return { slotId: ritual || withoutSpellSlot ? undefined : casting, ritual, withoutSpellSlot };
}
