import { COMPONENT } from '/imports/api/creature/log/discord/discordMessages';
import { BUTTON_STYLE, EPHEMERAL } from '/imports/api/discord/server/interactions/interactionReplies';

/*
 * The menus of /action (D6), as Discord draws them: a short text, string
 * selects (component 3) and buttons, in a message for its user alone. Pure:
 * interactionActions.ts fills them in.
 *
 * Discord's limits (https://docs.discord.com/developers/components/reference):
 * 25 options per select, 5 action rows per message, 5 buttons per row, 100
 * characters per option's label, value and description, 150 per placeholder,
 * 80 per button's label, 100 per custom_id. More than 25 options (a fight of
 * 30 goblins, a choice of 40 options) spread over several selects, 25 each,
 * one per row: up to 4 of them, the last row keeping the buttons; past 100,
 * the first 100 are offered and the text says how many more there are (a
 * fight holds 64 creatures at most, MAX_INITIATIVE_ENTRIES).
 */

export const SELECT = 3;
export const MAX_OPTIONS_PER_SELECT = 25;
export const MAX_SELECTS = 4;
export const MAX_OPTIONS = MAX_OPTIONS_PER_SELECT * MAX_SELECTS;
const MAX_BUTTONS_PER_ROW = 5;

export type MenuOption = { value: string, label: string, description?: string, default?: boolean };
export type MenuButton = { customId: string, label: string, style?: number, disabled?: boolean };

const cut = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1)}…`;

/**
 * The selects of a menu's options, 25 each, at most 4: their rows, and how
 * many options did not fit. `customId(index)` names each select; each select
 * takes between `min` and `max` of its own options (at most its count)
 */
export function selectRows(options: MenuOption[], { customId, placeholder, min = 1, max = 1 }: {
  customId: (index: number) => string, placeholder: string, min?: number, max?: number,
}): { rows: Record<string, unknown>[], hidden: number } {
  const shown = options.slice(0, MAX_OPTIONS);
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index * MAX_OPTIONS_PER_SELECT < shown.length; index += 1) {
    const chunk = shown.slice(index * MAX_OPTIONS_PER_SELECT, (index + 1) * MAX_OPTIONS_PER_SELECT);
    const most = Math.max(1, Math.min(max, chunk.length));
    rows.push({
      type: COMPONENT.actionRow,
      components: [{
        type: SELECT,
        custom_id: customId(index),
        placeholder: cut(placeholder, 150),
        min_values: Math.min(min, most),
        max_values: most,
        options: chunk.map(option => ({
          label: cut(option.label || '?', 100),
          value: option.value,
          ...option.description && { description: cut(option.description, 100) },
          ...option.default && { default: true },
        })),
      }],
    });
  }
  return { rows, hidden: options.length - shown.length };
}

/** The buttons of a menu, five per row */
export function buttonRows(buttons: MenuButton[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < buttons.length; i += MAX_BUTTONS_PER_ROW) {
    rows.push({
      type: COMPONENT.actionRow,
      components: buttons.slice(i, i + MAX_BUTTONS_PER_ROW).map(button => ({
        type: COMPONENT.button,
        style: button.style ?? BUTTON_STYLE.secondary,
        label: cut(button.label, 80),
        custom_id: button.customId,
        ...button.disabled && { disabled: true },
      })),
    });
  }
  return rows;
}

/**
 * A menu's message, for its user alone: its text, its selects, its buttons.
 * Five rows at most: the buttons that do not fit beside the selects go
 */
export function menuMessage(content: string, selects: Record<string, unknown>[], buttons: MenuButton[]) {
  const rows = [...selects.slice(0, MAX_SELECTS), ...buttonRows(buttons)].slice(0, MAX_SELECTS + 1);
  return { content: cut(content, 2000), flags: EPHEMERAL, components: rows, allowed_mentions: { parse: [] } };
}

/** The text that ends a menu: its components go */
export function closedMessage(content: string) {
  return { content: cut(content, 2000), flags: EPHEMERAL, components: [], allowed_mentions: { parse: [] } };
}
