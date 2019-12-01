export function isDefined(value: any): value is boolean {
  return typeof value !== 'undefined';
}
