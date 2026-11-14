/** Fixed daily schedule shared by deploy and smoke scripts. Deadlines are UTC seconds-of-day: 03:00, 09:00, 12:00, 14:00. */
export const DEADLINES_UTC: readonly number[] = [10800, 32400, 43200, 50400];
export const WINDOW_SECONDS = 5400;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 100;
