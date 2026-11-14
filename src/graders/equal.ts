/**
 * 동작 비교에 쓰는 구조 동치.
 *
 * 사전 등록한 비교 규칙:
 * - 원시값은 Object.is로 비교한다. NaN은 NaN과 같고 +0과 -0은 다르다.
 * - 배열은 길이와 각 원소를 순서대로 비교한다. 빈 칸(희소 배열)은 undefined와 구분한다.
 * - 객체는 자신의 열거 가능한 키 집합과 값을 비교한다. 키 순서와 프로토타입은 보지 않는다.
 * - Date는 시각, Map과 Set은 삽입 순서대로 원소를 비교한다.
 * - 함수는 참조가 같을 때만 같다.
 */

type Seen = WeakMap<object, WeakSet<object>>;

function isPlainComparable(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function alreadyComparing(a: object, b: object, seen: Seen): boolean {
  let partners = seen.get(a);
  if (partners === undefined) {
    partners = new WeakSet();
    seen.set(a, partners);
  }
  if (partners.has(b)) return true;
  partners.add(b);
  return false;
}

function arraysEqual(a: readonly unknown[], b: readonly unknown[], seen: Seen): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (i in a !== i in b) return false;
    if (!equalInner(a[i], b[i], seen)) return false;
  }
  return true;
}

function equalInner(a: unknown, b: unknown, seen: Seen): boolean {
  if (Object.is(a, b)) return true;
  if (!isPlainComparable(a) || !isPlainComparable(b)) return false;
  // 순환 참조: 같은 쌍을 다시 만나면 그 쌍은 바깥 비교가 판정한다.
  if (alreadyComparing(a, b, seen)) return true;

  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) return arraysEqual(a, b as unknown as unknown[], seen);

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map)) return false;
    return arraysEqual([...a.entries()], [...b.entries()], seen);
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set)) return false;
    return arraysEqual([...a.values()], [...b.values()], seen);
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false;
    if (!equalInner(a[key], b[key], seen)) return false;
  }
  return true;
}

export function structuralEqual(a: unknown, b: unknown): boolean {
  return equalInner(a, b, new WeakMap());
}
