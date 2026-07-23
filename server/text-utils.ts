export function clampLength(input: string, max: number): string {
  if (max <= 0) return "";
  if (input.length <= max) return input;
  return input.slice(0, max);
}
