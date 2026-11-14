import { describe, expect, it } from 'vitest';
import { parseLiteral } from '../../src/graders/literal.js';

function value(source: string): unknown {
  const result = parseLiteral(source);
  if (!result.ok) throw new Error(`해석 실패: ${result.reason}`);
  return result.value;
}

describe('parseLiteral 허용 구문', () => {
  it('빈 칸은 undefined가 아니라 실제 빈 칸으로 만든다', () => {
    const arr = value('[[ , 2], [1, , 3]]') as unknown[][];
    expect(arr[0]).toHaveLength(2);
    expect(0 in (arr[0] ?? [])).toBe(false);
    expect(1 in (arr[1] ?? [])).toBe(false);
    expect(arr[1]?.[2]).toBe(3);
  });

  it('-0, NaN, Infinity, undefined를 만든다', () => {
    const arr = value('[[1, NaN, -0], undefined, -Infinity, +5, 1_000]') as unknown[];
    const inner = arr[0] as unknown[];
    expect(Object.is(inner[2], -0)).toBe(true);
    expect(Number.isNaN(inner[1])).toBe(true);
    expect(1 in arr).toBe(true);
    expect(arr[1]).toBeUndefined();
    expect(arr.slice(2)).toEqual([-Infinity, 5, 1000]);
  });

  it('중첩 객체를 현재 realm의 일반 객체로 만든다', () => {
    const [obj] = value(`[{ a: { 'b.c': [true, null] }, 0: 'x', "__proto__": 1, t: \`s\` }]`) as [
      Record<string, unknown>,
    ];
    expect(Object.getPrototypeOf(obj)).toBe(Object.prototype);
    // __proto__ 키는 프로토타입을 바꾸지 않고 자기 속성으로 남는다.
    expect(Object.keys(obj).sort()).toEqual(['0', '__proto__', 'a', 't']);
    expect(obj.a).toEqual({ 'b.c': [true, null] });
    expect(obj['__proto__']).toBe(1);
  });

  it('Set, Map, Date, Object.create(null)을 만든다', () => {
    const [set, map, date, bare] = value(
      '[new Set([1, 2]), new Map([["a", 1]]), new Date(0), Object.create(null)]',
    ) as [Set<number>, Map<string, number>, Date, object];
    expect(set).toBeInstanceOf(Set);
    expect([...set]).toEqual([1, 2]);
    expect(map.get('a')).toBe(1);
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBe(0);
    expect(Object.getPrototypeOf(bare)).toBeNull();
  });
});

describe('parseLiteral 거부', () => {
  it.each([
    ['함수 호출', '[alert(1)]'],
    ['임의 식별자', '[process]'],
    ['getter', '[{ get a() { return 1; } }]'],
    ['메서드', '[{ a() {} }]'],
    ['객체 전개', '[{ ...x }]'],
    ['계산된 키', '[{ [k]: 1 }]'],
    ['배열 전개', '[...[1, 2]]'],
    ['단축 속성', '[{ undefined }]'],
    ['화살표 함수', '[() => 1]'],
    ['연산식', '[1 + 2]'],
    ['허용 밖 생성자', '[new Function("return 1")]'],
    ['인자 없는 Date', '[new Date()]'],
    ['괄호 탈출', '1), (2'],
    ['문장 여러 개', '1); alert(1); ('],
    ['문자열 앞 부호', '[-"1"]'],
    ['구문 오류', '[1, 2'],
  ])('%s', (_label, source) => {
    expect(parseLiteral(source).ok).toBe(false);
  });

  it('2000자를 넘으면 거부한다', () => {
    expect(parseLiteral(`["${'a'.repeat(2000)}"]`).ok).toBe(false);
  });
});
