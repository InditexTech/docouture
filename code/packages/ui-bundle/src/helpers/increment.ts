/** `{{increment value}}` — value + 1, treating a falsy value as 0. */
const increment = (value: number | undefined | null): number => (value || 0) + 1

export = increment
