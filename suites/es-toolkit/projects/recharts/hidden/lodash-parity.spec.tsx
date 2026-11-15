/**
 * Hidden behaviour-parity checks for the lodash -> es-toolkit migration of recharts.
 *
 * Copy this file into a one-level sub-folder of the project's test/ directory
 * (e.g. test/__hidden__/lodash-parity.spec.tsx) so that `../../src` resolves.
 *
 * Every expected value below was recorded by running this file against the
 * ORIGINAL lodash-based code (recharts @ a28c686). Each `it` targets one lodash
 * call site through the project's own exported code path, with an input that
 * the project can realistically receive and where lodash, es-toolkit (strict),
 * es-toolkit/compat or a hand-written native replacement may disagree.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { vi } from 'vitest';
import { scaleLinear } from 'victory-vendor/d3-scale';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Pie,
  PieChart,
  Treemap,
  XAxis,
  YAxis,
  LabelList,
} from '../../src';
import { DefaultLegendContent } from '../../src/component/DefaultLegendContent';
import { DefaultTooltipContent } from '../../src/component/DefaultTooltipContent';
import { getValueByDataKey, getBandSizeOfAxis } from '../../src/util/ChartUtils';
import { findEntryInArray } from '../../src/util/DataUtils';
import { findAllByType } from '../../src/util/ReactUtils';
import { getUniqPayload } from '../../src/util/payload/getUniqPayload';
import { createLabeledScales } from '../../src/util/CartesianUtils';
import { Shape } from '../../src/util/ActiveShapeUtils';
import { selectOrderedTooltipTicks } from '../../src/state/selectors/selectors';
import { treemapPayloadSearcher } from '../../src/chart/Treemap';
import { payloadSearcher as sunburstPayloadSearcher } from '../../src/chart/SunburstChart';
import { sankeyPayloadSearcher } from '../../src/chart/Sankey';
import { computeFunnelTrapezoids } from '../../src/cartesian/Funnel';
import { computeRadarPoints } from '../../src/polar/Radar';
import { mockGetBoundingClientRect } from '../helper/mockGetBoundingClientRect';
import { mockAnimation, cleanupMockAnimation } from '../helper/animation-frame-helper';

const textsOf = (container: Element, selector: string) =>
  Array.from(container.querySelectorAll(selector)).map((el) => el.textContent);

describe('lodash parity (hidden)', () => {
  /* ------------------------------------------------------------------ */
  /* util/ChartUtils.ts : get (getValueByDataKey)                        */
  /* ------------------------------------------------------------------ */

  it('util/ChartUtils.ts:get: dataKey deep paths (dot, bracket) resolve like lodash.get', () => {
    // Users routinely pass nested dataKeys such as "stats.uv" or "series[1]" on chart components.
    // A native obj[dataKey] replacement or strict es-toolkit (no string paths) returns undefined here.
    const entry = { stats: { uv: 7 }, series: [10, 20, 30] };
    expect(getValueByDataKey(entry, 'stats.uv')).toBe(7);
    expect(getValueByDataKey(entry, 'series[1]')).toBe(20);
    expect(getValueByDataKey(entry, 'series.2')).toBe(30);
    expect(getValueByDataKey(entry, 'stats.missing', 'fallback')).toBe('fallback');
  });

  it('util/ChartUtils.ts:get: null value is returned as null, default only for undefined', () => {
    // Gaps in series data are commonly encoded as null (connectNulls relies on it).
    // lodash.get returns the default only when the resolved value is undefined; `?? default` would replace null.
    const entry = { name: 'Mon', uv: null as number | null };
    expect(getValueByDataKey(entry, 'uv', 0)).toBeNull();
    expect(getValueByDataKey(entry, 'pv', 0)).toBe(0);
  });

  it('util/ChartUtils.ts:get: own key containing a dot wins over path traversal', () => {
    // Data parsed from CSV/JSON often has keys like "v1.2"; lodash.get checks the literal key first.
    // A split('.')-based replacement would look for entry.v1["2"] and return undefined.
    const entry = { 'v1.2': 42, v1: { 2: 'nested' } };
    expect(getValueByDataKey(entry, 'v1.2')).toBe(42);
  });

  it('util/ChartUtils.ts:get: numeric dataKey on tuple-shaped rows', () => {
    // DataKey<T> allows numbers; tuple rows like [x, y] are a documented data shape.
    expect(getValueByDataKey([5, 9], 1)).toBe(9);
    expect(getValueByDataKey([5, 9], 3, 'none')).toBe('none');
  });

  /* ------------------------------------------------------------------ */
  /* util/ChartUtils.ts : sortBy (getBandSizeOfAxis)                     */
  /* ------------------------------------------------------------------ */

  it('util/ChartUtils.ts:sortBy: sorts frozen tick arrays numerically without mutating them', () => {
    // Ticks come from the immer-frozen redux store, so an in-place Array#sort would throw.
    // Coordinates 100 / 25 / 9 also catch a default (lexicographic) sort.
    const ticks = Object.freeze([
      Object.freeze({ coordinate: 100, value: 'c', offset: 0 }),
      Object.freeze({ coordinate: 25, value: 'a', offset: 0 }),
      Object.freeze({ coordinate: 9, value: 'b', offset: 0 }),
    ]);
    const axis: any = { scale: scaleLinear() };
    expect(getBandSizeOfAxis(axis, ticks as any)).toBe(16);
    expect(ticks.map((t) => t.coordinate)).toEqual([100, 25, 9]);
  });

  /* ------------------------------------------------------------------ */
  /* state/selectors/selectors.ts : sortBy                               */
  /* ------------------------------------------------------------------ */

  it('state/selectors/selectors.ts:sortBy: ordered tooltip ticks are a new, numerically sorted, stable array', () => {
    // Reversed / category axes produce descending coordinates; ties happen with duplicated categories.
    const ticks = Object.freeze([
      Object.freeze({ coordinate: 100, value: 'x', index: 0, offset: 0 }),
      Object.freeze({ coordinate: 25, value: 'y', index: 1, offset: 0 }),
      Object.freeze({ coordinate: 9, value: 'z', index: 2, offset: 0 }),
      Object.freeze({ coordinate: 25, value: 'w', index: 3, offset: 0 }),
    ]);
    const result = selectOrderedTooltipTicks.resultFunc(ticks as any);
    expect(result.map((t: any) => t.value)).toEqual(['z', 'y', 'w', 'x']);
    expect(result).not.toBe(ticks);
  });

  /* ------------------------------------------------------------------ */
  /* component/DefaultLegendContent.tsx : sortBy                         */
  /* ------------------------------------------------------------------ */

  it('component/DefaultLegendContent.tsx:sortBy: default string itemSorter "value" (property shorthand), stable', () => {
    // itemSorter defaults to the string 'value'; strict es-toolkit sortBy needs an array of criteria
    // and a native sort would not be stable/would need a comparator.
    const payload: any[] = [
      { value: 'pv', dataKey: 'pv', color: 'red', type: 'line' },
      { value: 'amt', dataKey: 'amt1', color: 'blue', type: 'line' },
      { value: 'uv', dataKey: 'uv', color: 'green', type: 'line' },
      { value: 'amt', dataKey: 'amt2', color: 'black', type: 'line' },
    ];
    const { container } = render(<DefaultLegendContent payload={payload} />);
    expect(textsOf(container, '.recharts-legend-item-text')).toEqual(['amt', 'amt', 'pv', 'uv']);
    const colors = Array.from(container.querySelectorAll('.recharts-legend-item-text')).map(
      (el) => (el as HTMLElement).style.color,
    );
    expect(colors).toEqual(['blue', 'black', 'red', 'green']);
  });

  it('component/DefaultLegendContent.tsx:sortBy: itemSorter "dataKey" puts entries without dataKey last', () => {
    // Custom legend payloads frequently omit dataKey; lodash sortBy orders undefined after defined values.
    const payload: any[] = [
      { value: 'Custom', color: 'red', type: 'line' },
      { value: 'Beta', dataKey: 'b', color: 'blue', type: 'line' },
      { value: 'Alpha', dataKey: 'a', color: 'green', type: 'line' },
    ];
    const { container } = render(<DefaultLegendContent payload={payload} itemSorter="dataKey" />);
    expect(textsOf(container, '.recharts-legend-item-text')).toEqual(['Alpha', 'Beta', 'Custom']);
  });

  /* ------------------------------------------------------------------ */
  /* component/DefaultTooltipContent.tsx : sortBy                        */
  /* ------------------------------------------------------------------ */

  it('component/DefaultTooltipContent.tsx:sortBy: itemSorter "value" sorts numbers numerically (not lexicographically)', () => {
    // Tooltip values are numbers; Array#sort without comparator would give 100, 20, 300.
    const payload: any[] = [
      { name: 'uv', value: 300, dataKey: 'uv' },
      { name: 'pv', value: 20, dataKey: 'pv' },
      { name: 'amt', value: 100, dataKey: 'amt' },
    ];
    const { container } = render(<DefaultTooltipContent payload={payload} itemSorter="value" />);
    expect(textsOf(container, '.recharts-tooltip-item-name')).toEqual(['pv', 'amt', 'uv']);
  });

  it('component/DefaultTooltipContent.tsx:sortBy: itemSorter "name" (Tooltip default) and function iteratee', () => {
    // <Tooltip> passes itemSorter='name' by default; users also pass functions.
    const payload: any[] = [
      { name: 'uv', value: 1, dataKey: 'uv' },
      { name: 'amt', value: 3, dataKey: 'amt' },
      { name: 'pv', value: 2, dataKey: 'pv' },
    ];
    const byName = render(<DefaultTooltipContent payload={payload} itemSorter="name" />);
    expect(textsOf(byName.container, '.recharts-tooltip-item-name')).toEqual(['amt', 'pv', 'uv']);
    byName.unmount();
    const byFn = render(
      <DefaultTooltipContent payload={payload} itemSorter={(item) => -(item.value as number)} />,
    );
    expect(textsOf(byFn.container, '.recharts-tooltip-item-name')).toEqual(['amt', 'pv', 'uv']);
  });

  /* ------------------------------------------------------------------ */
  /* util/DataUtils.ts : get (findEntryInArray)                          */
  /* ------------------------------------------------------------------ */

  it('util/DataUtils.ts:get: findEntryInArray with nested string key and numeric key', () => {
    // Called with dataKey/nameKey values coming from props, which may be nested paths.
    const ary = [
      { payload: { name: 'a' }, 0: 'zero-a' },
      { payload: { name: 'b' }, 0: 'zero-b' },
    ];
    expect(findEntryInArray(ary, 'payload.name', 'b')).toBe(ary[1]);
    expect(findEntryInArray(ary, 0, 'zero-a')).toBe(ary[0]);
    expect(findEntryInArray(ary, 'payload.missing', undefined)).toBe(ary[0]);
  });

  /* ------------------------------------------------------------------ */
  /* util/ReactUtils.ts : get (findAllByType)                            */
  /* ------------------------------------------------------------------ */

  it('util/ReactUtils.ts:get: findAllByType tolerates text children and prefers displayName', () => {
    // JSX children routinely contain strings/numbers (whitespace, conditional text) whose `.type`
    // is undefined; lodash.get('type.displayName') returns undefined instead of throwing.
    function Plain() {
      return null;
    }
    function Named() {
      return null;
    }
    Named.displayName = 'Plain';
    const children = ['text child', 42, <Plain key="1" />, <Named key="2" />, <span key="3" />];
    expect(findAllByType(children, Plain)).toHaveLength(2);
    expect(findAllByType(children, 'span' as any)).toHaveLength(0);
  });

  /* ------------------------------------------------------------------ */
  /* util/payload/getUniqPayload.ts : uniqBy                             */
  /* ------------------------------------------------------------------ */

  it('util/payload/getUniqPayload.ts:uniqBy: keeps first occurrence in original order (default and custom iteratee)', () => {
    // Tooltip/Legend payloads contain duplicates when several series share a dataKey.
    const payload = [
      { dataKey: 'uv', id: 1 },
      { dataKey: 'pv', id: 2 },
      { dataKey: 'uv', id: 3 },
      { dataKey: undefined as string | undefined, id: 4 },
      { dataKey: undefined as string | undefined, id: 5 },
    ];
    expect(getUniqPayload(payload, true, (e) => e.dataKey).map((e) => e.id)).toEqual([1, 2, 4]);
    expect(
      getUniqPayload(
        payload,
        (e) => e.id % 2,
        (e) => e.dataKey,
      ).map((e) => e.id),
    ).toEqual([1, 2]);
    expect(getUniqPayload(payload, false, (e) => e.dataKey)).toBe(payload);
  });

  /* ------------------------------------------------------------------ */
  /* util/CartesianUtils.ts : mapValues, every                           */
  /* ------------------------------------------------------------------ */

  it('util/CartesianUtils.ts:mapValues+every: labeled scales apply/isInRange over coordinate objects', () => {
    // ReferenceDot/ReferenceArea pass {x, y} objects (sometimes only one axis); `every` on an object
    // must iterate its values (Array#every does not exist on objects).
    const scales = createLabeledScales({
      x: scaleLinear().domain([0, 10]).range([0, 100]),
      y: scaleLinear().domain([0, 10]).range([100, 0]),
    });
    expect(scales.apply({ x: 5, y: 2 })).toEqual({ x: 50, y: 80 });
    expect(scales.apply({ x: 1 })).toEqual({ x: 10 });
    expect(scales.isInRange({ x: 50, y: 80 })).toBe(true);
    expect(scales.isInRange({ x: 50, y: 120 })).toBe(false);
    expect(scales.isInRange({})).toBe(true);
  });

  /* ------------------------------------------------------------------ */
  /* util/ActiveShapeUtils.tsx : isPlainObject                           */
  /* ------------------------------------------------------------------ */

  it('util/ActiveShapeUtils.tsx:isPlainObject: null-prototype option object is treated as shape props', () => {
    // activeShape/shape options can come from config maps built with Object.create(null)
    // (e.g. deserialized style dictionaries). lodash treats them as plain objects.
    const option = Object.assign(Object.create(null), { fill: 'rgb(1, 2, 3)' });
    const { container } = render(
      <svg>
        <Shape
          option={option}
          shapeType="rectangle"
          isActive={false}
          {...({ x: 0, y: 0, width: 10, height: 10 } as any)}
        />
      </svg>,
    );
    expect(container.querySelector('path')?.getAttribute('fill')).toBe('rgb(1, 2, 3)');
  });

  it('util/ActiveShapeUtils.tsx:isPlainObject: class-instance option is NOT treated as shape props', () => {
    // A class instance (e.g. a theme/config object) is not a plain object in lodash, so its fields are
    // ignored and the element props are used as-is. A `typeof === 'object'` replacement would merge it.
    class StyleConfig {
      fill = 'rgb(9, 9, 9)';
    }
    const { container } = render(
      <svg>
        <Shape
          option={new StyleConfig()}
          shapeType="rectangle"
          isActive={false}
          {...({ x: 0, y: 0, width: 10, height: 10, fill: 'rgb(0, 0, 0)' } as any)}
        />
      </svg>,
    );
    expect(container.querySelector('path')?.getAttribute('fill')).toBe('rgb(0, 0, 0)');
  });

  /* ------------------------------------------------------------------ */
  /* chart/Treemap.tsx, chart/SunburstChart.tsx : get (payload searcher) */
  /* ------------------------------------------------------------------ */

  it('chart/Treemap.tsx:get: tooltip index path "children[0]children[1]" (no dots) resolves', () => {
    // addToTreemapNodeIndex builds exactly this dot-less bracket path; split('.')-based code fails.
    const leaf = { name: 'leaf' };
    const data: any = { children: [{ children: [{ name: 'other' }, leaf] }] };
    expect(treemapPayloadSearcher(data, 'children[0]children[1]')).toBe(leaf);
    expect(treemapPayloadSearcher(data, 'children[3]')).toBeUndefined();
  });

  it('chart/SunburstChart.tsx:get: tooltip index path "children[1]children[0]" resolves', () => {
    // addToSunburstNodeIndex builds the same dot-less bracket path.
    const leaf = { name: 'deep', value: 3 };
    const data: any = { children: [{ name: 'a' }, { name: 'b', children: [leaf] }] };
    expect(sunburstPayloadSearcher(data, 'children[1]children[0]')).toBe(leaf);
  });

  /* ------------------------------------------------------------------ */
  /* chart/Sankey.tsx : get (payload searcher), maxBy, min, sumBy, get   */
  /* ------------------------------------------------------------------ */

  it('chart/Sankey.tsx:get: sankeyPayloadSearcher resolves "node-1" via `${type}s[${i}]` path', () => {
    const computedData: any = {
      nodes: [
        { name: 'A', value: 10, payload: { name: 'A', value: 10 } },
        { name: 'B', value: 4, payload: { name: 'B', value: 4 } },
      ],
      links: [],
    };
    // activeIndex "node-1" is split and turned into the lodash path "nodes[1]".
    expect(sankeyPayloadSearcher(undefined, 'node-1', computedData, 'name')).toEqual({
      payload: { name: 'B', value: 4 },
      name: 'B',
      value: 4,
    });
    expect(sankeyPayloadSearcher(undefined, 'node-7', computedData, 'name')).toBeUndefined();
  });

  it('chart/Sankey.tsx:maxBy+min+sumBy+get: node layout with partial margin and an isolated node', () => {
    // An isolated node (no links) has value 0 and lives at depth 0; margin without `left`
    // must fall back to 0 through get(margin, 'left') || 0.
    const data = {
      nodes: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'Lonely' }],
      links: [
        { source: 0, target: 1, value: 30 },
        { source: 0, target: 2, value: 10 },
      ],
    };
    const { container } = render(
      <Sankey
        width={400}
        height={200}
        data={data}
        nodePadding={10}
        margin={{ top: 10 }}
        iterations={0}
      />,
    );
    const rects = Array.from(container.querySelectorAll('path.recharts-sankey-node')).map((r) => [
      r.getAttribute('x'),
      r.getAttribute('y'),
      r.getAttribute('width'),
      r.getAttribute('height'),
    ]);
    expect(rects).toEqual(SANKEY_EXPECTED);
  });

  /* ------------------------------------------------------------------ */
  /* chart/Treemap.tsx : omit, get(nameKey default)                      */
  /* ------------------------------------------------------------------ */

  it('chart/Treemap.tsx:omit+get: nest treemap renders nodes and the "root" breadcrumb default', () => {
    // Root node of a nest treemap has no `name`, so get(item, nameKey, 'root') supplies the default.
    // omit(nodeProps, 'children') must strip children before spreading onto <Rectangle>.
    // nameKey="label": the synthetic root node has no `label`, so the default 'root' is used.
    const data = [
      {
        label: 'A',
        children: [
          { label: 'A1', size: 10 },
          { label: 'A2', size: 20 },
        ],
      },
      { label: 'B', size: 30 },
    ];
    const { container } = render(
      <Treemap
        width={400}
        height={200}
        data={data}
        dataKey="size"
        nameKey="label"
        type="nest"
        isAnimationActive={false}
      />,
    );
    expect(textsOf(container, '.recharts-treemap-nest-index-box')).toEqual(['root']);
    const rects = Array.from(container.querySelectorAll('path.recharts-rectangle'));
    expect(rects.map((r) => r.getAttribute('data-recharts-item-index'))).toEqual([
      '',
      'children[0]',
      'children[1]',
    ]);
    expect(rects.some((r) => r.hasAttribute('children'))).toBe(false);
    act(() => {
      fireEvent.click(rects[1]);
    });
    expect(textsOf(container, '.recharts-treemap-nest-index-box')).toEqual(['root', 'A']);
  });

  /* ------------------------------------------------------------------ */
  /* cartesian/Funnel.tsx : omit                                         */
  /* ------------------------------------------------------------------ */

  it('cartesian/Funnel.tsx:omit: a data field named "width" does not override the computed trapezoid width', () => {
    // Funnel rows are user objects that may carry their own `width` column. omit(entry, 'width')
    // drops exactly that key; strict es-toolkit omit with a bare string would drop "w","i","d","t","h".
    const result = computeFunnelTrapezoids({
      dataKey: 'value',
      nameKey: 'name',
      displayedData: [
        { name: 'a', value: 100, width: 999, fill: 'red' },
        { name: 'b', value: 50, width: 999, fill: 'blue' },
      ] as any,
      offset: {
        left: 0,
        top: 0,
        width: 400,
        height: 200,
        right: 0,
        bottom: 0,
        brushBottom: 0,
      } as any,
    });
    expect(result.trapezoids.map((t) => t.width)).toEqual([350, 175]);
    expect(result.trapezoids.map((t) => (t as any).fill)).toEqual(['red', 'blue']);
  });

  /* ------------------------------------------------------------------ */
  /* component/ResponsiveContainer.tsx : throttle                        */
  /* ------------------------------------------------------------------ */

  it('component/ResponsiveContainer.tsx:throttle: leading=false/trailing=true call timing with debounce', () => {
    // debounce>0 wraps the ResizeObserver callback in throttle({leading:false, trailing:true}).
    vi.useFakeTimers();
    try {
      let notify: (entries: unknown) => void = () => {};
      (window as any).ResizeObserver = vi.fn().mockImplementation((cb) => {
        notify = cb;
        return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
      });
      mockGetBoundingClientRect({ width: 100, height: 100 });
      const onResize = vi.fn();
      render(
        <ResponsiveContainer width="100%" height={200} debounce={100} onResize={onResize}>
          <div />
        </ResponsiveContainer>,
      );
      const fire = (w: number) => act(() => notify([{ contentRect: { width: w, height: 50 } }]));
      const log: Array<[number, number]> = [];
      let now = 0;
      // advance in 10ms steps so the log records when each call happened (10ms resolution)
      const tick = (ms: number) => {
        for (let step = 0; step < ms; step += 10) {
          act(() => {
            vi.advanceTimersByTime(10);
          });
          now += 10;
          onResize.mock.calls.slice(log.length).forEach((c) => log.push([now, c[0]]));
        }
      };
      fire(1);
      expect(onResize).not.toHaveBeenCalled(); // leading: false
      tick(30);
      fire(2);
      tick(30);
      fire(3);
      tick(50); // t=110
      fire(4);
      tick(150); // t=260
      fire(5);
      tick(10);
      tick(200); // t=470
      expect(log).toEqual(THROTTLE_EXPECTED);
    } finally {
      vi.useRealTimers();
    }
  });

  /* ------------------------------------------------------------------ */
  /* cartesian/Area.tsx : max                                            */
  /* ------------------------------------------------------------------ */

  it('cartesian/Area.tsx:max: animated clip rect width uses the max x of points/baseLine', () => {
    // VerticalRect/HorizontalRect compute the clip size from max(points.map(x||0)) while animating.
    const data = [
      { x: 1, y: 10 },
      { x: 2, y: 30 },
      { x: 3, y: 20 },
    ];
    const { container } = render(
      <AreaChart
        width={300}
        height={200}
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <XAxis type="number" dataKey="y" hide />
        <YAxis type="category" dataKey="x" hide />
        <Area dataKey="y" isAnimationActive />
      </AreaChart>,
    );
    const clipRects = Array.from(container.querySelectorAll('clipPath rect')).map((r) => [
      r.getAttribute('x'),
      r.getAttribute('width'),
    ]);
    expect(clipRects).toEqual(AREA_EXPECTED);
  });

  /* ------------------------------------------------------------------ */
  /* cartesian/CartesianAxis.tsx : get                                   */
  /* ------------------------------------------------------------------ */

  it('cartesian/CartesianAxis.tsx:get: axisLine/tickLine className from object, boolean true tolerated', () => {
    // axisLine/tickLine are `boolean | SVGProps`; get(true, 'className') must be undefined, not throw.
    const data = [{ v: 1 }, { v: 2 }];
    const { container } = render(
      <LineChart width={300} height={200} data={data}>
        <XAxis axisLine={{ className: 'my-axis-line' }} tickLine={{ className: 'my-tick-line' }} />
        <YAxis axisLine tickLine />
        <Line dataKey="v" isAnimationActive={false} />
      </LineChart>,
    );
    expect(container.querySelectorAll('.recharts-cartesian-axis-line.my-axis-line')).toHaveLength(
      1,
    );
    expect(
      container.querySelectorAll('.recharts-cartesian-axis-tick-line.my-tick-line').length,
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll('.recharts-cartesian-axis-line')).toHaveLength(2);
  });

  /* ------------------------------------------------------------------ */
  /* cartesian/ReferenceLine.tsx : some                                  */
  /* ------------------------------------------------------------------ */

  it('cartesian/ReferenceLine.tsx:some: ifOverflow="discard" drops a segment with any point out of range', () => {
    const data = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const { container } = render(
      <LineChart width={300} height={200} data={data}>
        <XAxis type="number" dataKey="x" domain={[0, 10]} />
        <YAxis type="number" dataKey="y" domain={[0, 10]} />
        <ReferenceLine
          segment={[
            { x: 1, y: 1 },
            { x: 5, y: 50 },
          ]}
          ifOverflow="discard"
          className="out"
        />
        <ReferenceLine
          segment={[
            { x: 1, y: 1 },
            { x: 5, y: 5 },
          ]}
          ifOverflow="discard"
          className="in"
        />
      </LineChart>,
    );
    expect(container.querySelectorAll('.out .recharts-reference-line-line')).toHaveLength(0);
    expect(container.querySelectorAll('.in .recharts-reference-line-line')).toHaveLength(1);
  });

  /* ------------------------------------------------------------------ */
  /* cartesian/Brush.tsx, state/selectors/axisSelectors.ts : range       */
  /* ------------------------------------------------------------------ */

  it('cartesian/Brush.tsx+state/selectors/axisSelectors.ts:range: index domain for axis without dataKey and brush', () => {
    // A categorical XAxis without dataKey uses range(0, data.length) as its domain; Brush uses
    // range(0, len) for its scale domain, which positions the two travellers.
    const data = [{ v: 4 }, { v: 3 }, { v: 2 }, { v: 1 }];
    const { container } = render(
      <BarChart width={400} height={300} data={data}>
        <XAxis />
        <Bar dataKey="v" isAnimationActive={false} />
        <Brush startIndex={1} endIndex={2} />
      </BarChart>,
    );
    // the axis only sees the 2 brushed rows, so its index domain is range(0, 2)
    expect(textsOf(container, '.xAxis .recharts-cartesian-axis-tick-value')).toEqual(['0', '1']);
    const travellers = Array.from(container.querySelectorAll('.recharts-brush-traveller')).map(
      (t) => t.querySelector('rect')?.getAttribute('x'),
    );
    expect(travellers).toEqual(BRUSH_TRAVELLERS_EXPECTED);
  });

  /* ------------------------------------------------------------------ */
  /* state/selectors/selectChartOffset.ts : get                          */
  /* ------------------------------------------------------------------ */

  it('state/selectors/selectChartOffset.ts:get: top-oriented XAxis height is added to offset.top', () => {
    const data = [{ v: 1 }, { v: 2 }];
    const { container } = render(
      <LineChart
        width={300}
        height={200}
        data={data}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <XAxis orientation="top" height={40} />
        <XAxis xAxisId="b" orientation="bottom" height={25} />
        <Line dataKey="v" isAnimationActive={false} />
      </LineChart>,
    );
    const rect = container.querySelector('clipPath rect');
    expect([rect?.getAttribute('y'), rect?.getAttribute('height')]).toEqual(['40', '135']);
  });

  /* ------------------------------------------------------------------ */
  /* component/LabelList.tsx : last                                      */
  /* ------------------------------------------------------------------ */

  it('component/LabelList.tsx:last: range values label with their last element', () => {
    // Range bars use [low, high] tuples; the default accessor shows the high end.
    const data = [
      { name: 'a', range: [2, 8] },
      { name: 'b', range: [3, 5] },
    ];
    const { container } = render(
      <BarChart width={300} height={200} data={data}>
        <Bar dataKey="range" isAnimationActive={false}>
          <LabelList />
        </Bar>
      </BarChart>,
    );
    expect(textsOf(container, '.recharts-label-list text')).toEqual(['8', '5']);
  });

  /* ------------------------------------------------------------------ */
  /* polar/Radar.tsx : last, first                                       */
  /* ------------------------------------------------------------------ */

  it('polar/Radar.tsx:last+first: range radar uses last for outer and first for base radius', () => {
    const radiusAxis: any = { scale: scaleLinear().domain([0, 10]).range([0, 100]) };
    const angleAxis: any = {
      scale: (i: number) => i * 90,
      type: 'number',
      dataKey: 'i',
      cx: 0,
      cy: 0,
    };
    const result = computeRadarPoints({
      radiusAxis,
      angleAxis,
      displayedData: [
        { i: 0, v: [2, 8] },
        { i: 1, v: 5 },
        { i: 2, v: [1, 4, 6] },
      ],
      dataKey: 'v',
      bandSize: 0,
    } as any);
    expect(result.isRange).toBe(true);
    expect(result.points.map((p) => p.radius)).toEqual([80, 50, 60]);
    expect(result.baseLinePoints.map((p) => p.radius)).toEqual([20, 50, 10]);
  });

  /* ------------------------------------------------------------------ */
  /* polar/PolarRadiusAxis.tsx : maxBy, minBy                            */
  /* ------------------------------------------------------------------ */

  it('polar/PolarRadiusAxis.tsx:maxBy+minBy: label viewBox spans min..max tick radius', () => {
    const data = [
      { s: 'a', v: 10 },
      { s: 'b', v: 50 },
      { s: 'c', v: 100 },
    ];
    const labelSpy = vi.fn(() => null);
    render(
      <RadarChart width={300} height={300} data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="s" />
        <PolarRadiusAxis label={labelSpy} />
        <Radar dataKey="v" isAnimationActive={false} />
      </RadarChart>,
    );
    const viewBoxes = labelSpy.mock.calls.map((c: any[]) => c[0].viewBox);
    expect(viewBoxes[viewBoxes.length - 1]).toEqual(RADIUS_VIEWBOX_EXPECTED);
  });

  /* ------------------------------------------------------------------ */
  /* polar/Pie.tsx : get                                                 */
  /* ------------------------------------------------------------------ */

  it('polar/Pie.tsx:get: paddingAngle read from sector entries during animation', () => {
    // get(entry, 'paddingAngle', 0) only runs inside the animated branch (SectorsWithAnimation),
    // so the animation is driven to its last frame with the project's rAF mock.
    mockAnimation();
    try {
      const data = [{ v: 1 }, { v: 1 }, { v: 2 }];
      const { container } = render(
        <PieChart width={300} height={300}>
          <Pie
            data={data}
            dataKey="v"
            paddingAngle={10}
            animationBegin={0}
            animationDuration={500}
          />
        </PieChart>,
      );
      const paths = Array.from(container.querySelectorAll('.recharts-pie-sector path')).map((p) =>
        p.getAttribute('d')?.replace(/\s+/g, ' ').trim(),
      );
      expect(paths).toEqual(PIE_EXPECTED);
    } finally {
      cleanupMockAnimation();
    }
  });
});

// ---- expected literals recorded against lodash @ a28c686 ----
const SANKEY_EXPECTED = [
  ['0', '10', '10', '170'],
  ['390', '10', '10', '127.5'],
  ['390', '147.5', '10', '42.5'],
];
// fire(1)@0, fire(2)@30, fire(3)@60 -> one trailing call @100 with the latest entry (3);
// fire(4)@110 -> trailing @210; fire(5)@260 -> trailing @360.
const THROTTLE_EXPECTED = [
  [100, 3],
  [210, 4],
  [360, 5],
];
const AREA_EXPECTED = [
  ['0', '300'],
  ['0', '282.25'],
];
const BRUSH_TRAVELLERS_EXPECTED = ['133.33333333333334', '261.6666666666667'];
const RADIUS_VIEWBOX_EXPECTED = {
  cx: 150,
  cy: 150,
  startAngle: 0,
  endAngle: 0,
  innerRadius: 0,
  outerRadius: 116,
};
const PIE_EXPECTED = [
  'M 266,150 A 116,116,0, 0,0, 165.141038297526,34.992396080638 L 150,150 Z',
  'M 144.94015106562102,34.11040629650449 A 116,116,0, 0,0, 34.441415021357514,139.88993384127164 L 150,150 Z',
  'M 34.441415021357514,160.11006615872833 A 116,116,0, 0,0, 264.2376993494161,170.14318860936393 L 150,150 Z',
];
