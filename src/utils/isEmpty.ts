export function isEmpty(value: any): value is [] {
  return Array.isArray(value) && value.length === 0;
}
