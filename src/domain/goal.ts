/**
 * Goal and drink size defaults.
 *
 * Who sets the daily goal is still an open question in the plan, so it is a
 * constant here rather than a stored setting. Building storage for an undecided
 * feature is how settings screens end up full of options nobody chose.
 */

/** Daily target in millilitres. */
export const DEFAULT_DAILY_GOAL_ML = 2000;

/** A one tap drink size. */
export interface DrinkPreset {
  /** Short label for the button. */
  label: string;
  /** Volume in millilitres. */
  amountMl: number;
}

/**
 * The one tap options.
 *
 * Three, not six. Every extra button is another decision between the user and a
 * logged drink, and the whole design goal is that logging takes under two
 * seconds.
 */
export const DRINK_PRESETS: readonly DrinkPreset[] = [
  { label: "Glass", amountMl: 250 },
  { label: "Bottle", amountMl: 500 },
  { label: "Large", amountMl: 750 },
];
