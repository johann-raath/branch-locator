/**
 * Next highlighted row for arrow-key navigation in a list. -1 means "nothing highlighted".
 * Down from nothing goes to the first row, up from nothing to the last; both ends wrap.
 */
export function moveIndex(current: number, delta: 1 | -1, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta === 1 ? 0 : length - 1;
  return (current + delta + length) % length;
}
