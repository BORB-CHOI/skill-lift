/**
 * 입력 범위를 실행 가능한 생성기로 정의한 과제를 읽는다.
 *
 * 과제 폴더의 inputs.mjs가 내보낸 함수마다 "범위 안의 입력 하나를 만드는 함수"를 둔다.
 * 과제 문장의 범위 설명과 채점 입력이 같은 정의에서 나오므로 둘이 어긋나지 않는다.
 * 시험 실행에서 범위는 넓게 적고 검사는 몇 건만 해서 기준 해답이 틀린 적이 있다.
 *
 * 생성 개수와 시드는 sealed.json의 generated 필드에 둔다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mulberry32 } from '../stats/paired.js';
import { loadMigrateTask, type LoadedTask } from './spec.js';

export type InputGenerator = (random: () => number) => unknown[];

interface GeneratedConfig {
  readonly seed: number;
  readonly count: number;
}

function readGeneratedConfig(sealedFile: string): GeneratedConfig | null {
  const sealed: unknown = JSON.parse(readFileSync(sealedFile, 'utf8'));
  if (typeof sealed !== 'object' || sealed === null) return null;
  const config = (sealed as Record<string, unknown>)['generated'];
  if (typeof config !== 'object' || config === null) return null;
  const { seed, count } = config as Record<string, unknown>;
  if (!Number.isInteger(seed) || !Number.isInteger(count) || (count as number) <= 0) {
    throw new TypeError('sealed.json: generated는 { seed: 정수, count: 양의 정수 }여야 한다');
  }
  return { seed: seed as number, count: count as number };
}

async function loadGenerators(file: string): Promise<Readonly<Record<string, InputGenerator>>> {
  const module = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const generators = module['generators'];
  if (typeof generators !== 'object' || generators === null) {
    throw new TypeError(`${file}: generators 객체를 내보내야 한다`);
  }
  return generators as Record<string, InputGenerator>;
}

/** 과제를 읽고, 생성기가 있으면 생성한 입력을 비공개 입력 뒤에 붙인다. */
export async function loadTaskWithGeneratedInputs(
  taskDir: string,
  sealedFile: string,
): Promise<LoadedTask> {
  const loaded = loadMigrateTask(taskDir, sealedFile);
  const generatorFile = join(taskDir, 'inputs.mjs');
  const config = readGeneratedConfig(sealedFile);
  if (!existsSync(generatorFile) || config === null) return loaded;

  const generators = await loadGenerators(generatorFile);
  const exports = loaded.task.exports.map((spec, index) => {
    const generate = generators[spec.name];
    if (typeof generate !== 'function') {
      throw new TypeError(`${generatorFile}: ${spec.name}의 생성기가 없다`);
    }
    // 함수마다 시드를 달리해 한 함수의 생성기를 고쳐도 다른 함수의 입력이 바뀌지 않게 한다.
    const random = mulberry32(config.seed + index);
    const generated: unknown[][] = [];
    for (let i = 0; i < config.count; i++) {
      const args = generate(random);
      if (!Array.isArray(args)) {
        throw new TypeError(`${generatorFile}: ${spec.name}의 생성기는 인자 배열을 돌려줘야 한다`);
      }
      generated.push(args);
    }
    return { ...spec, hidden: [...spec.hidden, ...generated] };
  });
  return { source: loaded.source, task: { ...loaded.task, exports } };
}
