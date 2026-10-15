import Task from '/imports/api/engine/action/tasks/Task';

type InputProvider = {
  /**
   * Show the user the next property or task to apply and wait for input to continue
   */
  nextStep?(task: Task): Promise<void>;
  /**
   * Roll dice
   * @param dice How many dice
   * @param diceSize How many faces per die
   */
  rollDice(
    dice: { number: number, diceSize: number }[]
  ): Promise<number[][]>;
  /**
   * Roll dice for a target hidden from the actor's readers: a game master's
   * monster's saving throw against a player's character (phase 2.3 of the
   * monsters). The server's alone, from a stream of the action's dice that
   * the client can never draw (server/actionDice.ts). An input provider
   * without it cannot resolve what such a target does: the browser's
   * simulation, which leaves it to the server (hiddenStats.ts, targetSight)
   * @param targetId The hidden target the dice are rolled for
   * @param dice How many dice, and how many faces each
   */
  rollHiddenDice?(
    targetId: string, dice: { number: number, diceSize: number }[]
  ): Promise<number[][]>;
  /**
   * Choose from a provided selection
   * @param action 
   * @param choices Options to choose from
   * @param quantity Number of choices to make [min, max] inclusive, where -1 means no limit
   */
  choose(
    choices: ({ _id: string } & Record<string, any>)[],
    quantity?: [min: number, max: number],
  ): Promise<string[]>;
  /**
   * Get advantage, natural, or disadvantage for a d20 roll
   */
  advantage(suggestedAdvantage: Advantage): Promise<Advantage>;
  /**
   * Get the details of a check or save
   */
  check(suggestedParams: CheckParams): Promise<CheckParams>;
}

export type Advantage = 0 | 1 | -1;

export type CheckParams = {
  advantage: Advantage;
  skillVariableName?: string;
  abilityVariableName?: string;
  dc: number | null;
  contest?: true;
  targetSkillVariableName?: string;
  targetAbilityVariableName?: string;
}

export default InputProvider;
