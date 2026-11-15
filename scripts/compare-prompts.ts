/**
 * 지시문 수준별로 skill − baseline 차이를 비교하는 탐색 집계.
 *
 * 사전 등록 판정(score.ts)과 별개다. 결과 폴더 여러 개를 받아 (지시문, 프로젝트, 모델)마다
 * baseline과 skill의 실행 점수를 모으고, 두 표본 순열 검정의 p값과 순열 검정을 뒤집은 95% 구간을 낸다.
 * 사전 등록 이후 추가한 비교라서 Holm 보정을 하지 않고 판정 문구도 붙이지 않는다.
 *
 * 사용: tsx scripts/compare-prompts.ts <라벨>=<이름> [<라벨>=<이름> ...]
 * 예:   tsx scripts/compare-prompts.ts 상세=main-project 짧음=minimal-prompt
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  armScores,
  cellRuns,
  runDurationMs,
  runTurnCount,
  type RunRecord,
} from '../src/stats/aggregate.js';
import { DESIGN_MODELS, DESIGN_PROJECTS, modelLabel } from '../src/stats/decision.js';
import { loadRuns } from '../src/stats/load-runs.js';
import { mean } from '../src/stats/paired.js';
import { permutationInterval, permutationTests } from '../src/stats/permutation.js';

const ALPHA = 0.05;
/** 사전 등록한 동등 한계. 여기서는 동등 p값을 참고로만 낸다. */
const DELTA = 0.15;

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const specs = process.argv.slice(2).map((arg) => {
  const [label, name] = arg.split('=');
  if (label === undefined || name === undefined || label === '' || name === '') {
    throw new Error(`인자 형식은 <라벨>=<결과 폴더 이름>이다: ${arg}`);
  }
  return { label, runs: loadRuns(join(repoRoot, 'results/es-toolkit-migrate-project', name)) };
});
if (specs.length === 0) throw new Error('결과 폴더를 하나 이상 지정한다');

const pp = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}`;
const pct = (v: number | null): string => (v === null ? '-' : `${(v * 100).toFixed(1)}%`);
const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};
const medianOf = (runs: readonly RunRecord[], pick: (r: RunRecord) => number | null): string => {
  const m = median(runs.map(pick).filter((v): v is number => v !== null));
  return m === null ? '-' : m.toFixed(0);
};

const lines: string[] = [
  '| 지시문 | 프로젝트 | 모델 | baseline 평균 (n) | skill 평균 (n) | skill − baseline | 95% 구간 | 차이 p | 동등 p | 턴 중앙값 b/s | 시간(초) 중앙값 b/s |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];
for (const { label, runs } of specs) {
  for (const project of DESIGN_PROJECTS) {
    for (const model of DESIGN_MODELS) {
      const cell = cellRuns(runs, project, model);
      const baseline = armScores(cell, 'baseline');
      const skill = armScores(cell, 'skill');
      const byArm = (arm: string): RunRecord[] => cell.filter((r) => r.meta.arm === arm);
      const turns = `${medianOf(byArm('baseline'), (r) => runTurnCount(r.meta))}/${medianOf(byArm('skill'), (r) => runTurnCount(r.meta))}`;
      const secs = (r: RunRecord): number | null => {
        const ms = runDurationMs(r.meta);
        return ms === null ? null : ms / 1000;
      };
      const time = `${medianOf(byArm('baseline'), secs)}/${medianOf(byArm('skill'), secs)}`;
      const head = `| ${label} | ${project} | ${modelLabel(model)} | ${pct(baseline.length === 0 ? null : mean(baseline))} (${baseline.length}) | ${pct(skill.length === 0 ? null : mean(skill))} (${skill.length}) |`;
      if (baseline.length === 0 || skill.length === 0) {
        lines.push(`${head} - | - | - | - | ${turns} | ${time} |`);
        continue;
      }
      const tests = permutationTests(skill, baseline, DELTA);
      const ci = permutationInterval(skill, baseline, ALPHA, { tolerance: 1e-4 });
      lines.push(
        `${head} ${pp(tests.meanDifference)}pp | [${pp(ci.lower)}, ${pp(ci.upper)}] | ${tests.pDifference.toFixed(3)} | ${tests.pEquivalence.toFixed(3)} | ${turns} | ${time} |`,
      );
    }
  }
}
console.log(lines.join('\n'));
