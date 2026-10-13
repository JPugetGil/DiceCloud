// The message saying when a property resets, for the events the app fires
// itself: the rests, and the creature's turn in a party's initiative tracker
const RESET_MESSAGES = {
  shortRest: 'viewers.resetShortRest',
  longRest: 'viewers.resetLongRest',
  turnStart: 'viewers.resetTurnStart',
  turnEnd: 'viewers.resetTurnEnd',
};

/** The message key for a property's `reset`, undefined for any other event */
export default function resetMessage(reset) {
  return typeof reset === 'string' && Object.prototype.hasOwnProperty.call(RESET_MESSAGES, reset)
    ? RESET_MESSAGES[reset] : undefined;
}
