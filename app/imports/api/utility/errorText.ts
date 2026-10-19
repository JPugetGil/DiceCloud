/**
 * What a caught error says, to show or log: a Meteor.Error's reason, else its
 * message, else the thrown value as text. A `catch` gets `unknown`: whatever
 * was thrown, this reads it without failing
 */
export default function errorText(error: unknown): string {
  const { reason, message } = (error ?? {}) as { reason?: unknown, message?: unknown };
  return String(reason || message || error);
}
