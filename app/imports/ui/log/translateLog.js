import i18n from '/imports/ui/i18n';
import { translateLogLine } from '/imports/api/creature/log/logMessages';

/*
 * Log lines in the interface's language (UX5): what the engine wrote as
 * messages (`i18n` on each line) is translated here, when the log shows it.
 * Reactive: a component that calls these in a computed follows the language.
 */
const translate = (key, params) => i18n.global.te(key, 'en') ? i18n.global.t(key, params) : undefined;

export const translateLine = line => translateLogLine(line, translate);

export const translateLogContent = (content = []) => content.map(translateLine);
