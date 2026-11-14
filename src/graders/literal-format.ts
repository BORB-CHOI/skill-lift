/**
 * 값을 JavaScript 리터럴 문자열로 직렬화한다. 보고서 반례 형식(설계 문서 5절)과 같은 문법만 쓴다.
 * JSON이 표현하지 못하는 NaN, -0, undefined, 배열의 빈 칸, Set, Map, Date, 프로토타입 없는 객체를 다룬다.
 */
export function toLiteral(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (Object.is(value, -0)) return '-0';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) parts.push(i in value ? toLiteral(value[i]) : '');
    // 마지막 원소가 빈 칸이면 쉼표를 하나 더 붙여야 길이가 보존된다.
    const tail = value.length > 0 && !(value.length - 1 in value) ? ',' : '';
    return `[${parts.join(', ')}${tail}]`;
  }
  if (value instanceof Set) return `new Set(${toLiteral([...value])})`;
  if (value instanceof Map) return `new Map(${toLiteral([...value])})`;
  if (value instanceof Date) return `new Date(${toLiteral(value.getTime())})`;
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${toLiteral(v)}`);
    if (Object.getPrototypeOf(value) === null) {
      if (entries.length > 0)
        throw new Error('키가 있는 프로토타입 없는 객체는 리터럴로 표현하지 않는다');
      return 'Object.create(null)';
    }
    return `{ ${entries.join(', ')} }`;
  }
  throw new Error(`리터럴로 표현할 수 없는 값: ${typeof value}`);
}
