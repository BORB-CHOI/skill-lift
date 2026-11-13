/**
 * 번들 크기 측정.
 *
 * 이전 과제의 목적이 번들 크기 축소이므로 "어느 진입점에서 가져왔는가"를 분류하지 않고
 * 결과 파일을 실제로 번들해 바이트 수를 측정한다. 측정값이 재현되도록 번들러 옵션과 gzip 수준을
 * 여기 한 곳에 고정한다. 번들러 버전은 package.json과 lockfile이 고정한다.
 */
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

export interface BundleSize {
  /** 압축(minify)한 번들의 바이트 수. */
  readonly minified: number;
  /** 압축한 번들을 gzip한 바이트 수. 판정에는 이 값을 쓴다. */
  readonly gzipped: number;
  /**
   * 압축한 번들에서 node_modules 밖의 코드(제출 파일 자신)가 차지하는 바이트 수.
   * 라이브러리 함수를 쓰지 않고 직접 구현하면 이 값이 커진다.
   */
  readonly ownBytes: number;
}

/** 번들러가 보고한 입력 파일별 바이트에서 라이브러리 밖의 코드만 더한다. */
function sumOwnBytes(inputs: Readonly<Record<string, { bytesInOutput: number }>>): number {
  let total = 0;
  for (const [path, info] of Object.entries(inputs)) {
    if (!path.replace(/\\/g, '/').includes('node_modules/')) total += info.bytesInOutput;
  }
  return total;
}

/** 사전 등록 대상. 바꾸면 이전 측정값과 비교할 수 없다. */
export const BUNDLE_OPTIONS = {
  bundle: true,
  minify: true,
  treeShaking: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  logLevel: 'silent',
} as const;

const GZIP_LEVEL = 9;

/**
 * 진입 파일 하나를 번들해 크기를 측정한다.
 * @param entryFile 진입 파일의 절대 경로
 * @param resolveDir 의존성을 찾을 디렉터리(node_modules가 있는 곳)
 */
export async function measureBundleSize(
  entryFile: string,
  resolveDir: string,
): Promise<BundleSize> {
  const result = await build({
    ...BUNDLE_OPTIONS,
    entryPoints: [entryFile],
    absWorkingDir: resolveDir,
    metafile: true,
  });
  const output = result.outputFiles[0];
  const meta = Object.values(result.metafile.outputs)[0];
  if (output === undefined || meta === undefined) {
    throw new Error(`번들 결과가 없다: ${entryFile}`);
  }
  return {
    minified: output.contents.byteLength,
    gzipped: gzipSync(output.contents, { level: GZIP_LEVEL }).byteLength,
    ownBytes: sumOwnBytes(meta.inputs),
  };
}

/** 번들 크기가 기준 해답의 (1 + epsilon)배 이하인지 판정한다. */
export function withinSizeBudget(measured: number, reference: number, epsilon: number): boolean {
  if (!(reference > 0)) throw new RangeError('기준 크기는 양수여야 한다');
  if (!(epsilon >= 0)) throw new RangeError('허용 오차는 0 이상이어야 한다');
  return measured <= reference * (1 + epsilon);
}
