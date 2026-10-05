/*
 * A character's build in named steps (UX12): the choices its libraries ask
 * for, as the Build tab lists them. A library sets the steps out as slots
 * that expect a choice (Race, Background, Starting Class), under its
 * ruleset's `base` slot; the slots a choice opens under a step (a subrace)
 * belong to that step, rather than adding to the count. So the count does
 * not go back when a choice opens more, and a step whose slot condition is
 * not met yet still counts, as locked, rather than appearing later.
 *
 * Slots are creature properties of type propertySlot, with `left` and
 * `right` (nested sets), `slotTags`, `quantityExpected`, `spaceLeft`,
 * `slotCondition`, `ignored`, `inactive` and `removed`.
 */

const expectsChoice = slot => slot.quantityExpected?.value > 0;
const isFilled = slot => !(slot.spaceLeft > 0);
// A ruleset's slot: the steps are under it, and it is one only until chosen
const isContainer = slot => !!slot.slotTags?.includes('base');
// Its condition not met: shown, but its choice cannot be made yet
const isLocked = slot => !!slot.inactive || ('value' in (slot.slotCondition || {})
  && [false, 0, ''].includes(slot.slotCondition.value));
const contains = (outer, inner) => outer.left < inner.left && outer.right > inner.right;

/**
 * The steps, in the library's order: each step's slot, whether it is done
 * (its choice made, and every choice it opened), whether it is locked, and
 * the first slot still waiting in it. `total` and `done` count steps, `left`
 * the steps that can be done now and are not.
 */
export default function buildSteps(allSlots = []) {
  // An inactive slot (a tutorial's stage turned off) counts only if its
  // choice was made: a step done earlier
  const slots = allSlots
    .filter(slot => !slot.removed && !slot.ignored && expectsChoice(slot)
      && !(slot.inactive && !isFilled(slot)))
    .sort((a, b) => a.left - b.left);
  const isStep = slot => slots.every(other => other === slot || !contains(other, slot) || isContainer(other))
    && !(isContainer(slot) && isFilled(slot));
  const stepSlots = slots.filter(isStep);
  const steps = stepSlots.map(slot => {
    const locked = isLocked(slot);
    // The choices it opened: in play, and not themselves steps
    const members = slots.filter(other => contains(slot, other) && !stepSlots.includes(other)
      && !isLocked(other));
    const waiting = [slot, ...members].filter(other => !isFilled(other));
    return {
      _id: slot._id,
      name: slot.name,
      locked,
      // A locked step filled earlier (a tutorial's step, hidden once past it) counts as done
      done: isFilled(slot) && (locked || !waiting.length),
      waitingId: locked ? undefined : waiting[0]?._id,
    };
  });
  const done = steps.filter(step => step.done).length;
  return {
    steps,
    total: steps.length,
    done,
    left: steps.filter(step => !step.done && !step.locked).length,
    next: steps.find(step => !step.done && !step.locked),
  };
}
