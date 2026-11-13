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
  });
  const output = result.outputFiles[0];
  if (output === undefined) {
    throw new Error(`번들 결과가 없다: ${entryFile}`);
  }
  return {
    minified: output.contents.byteLength,
    gzipped: gzipSync(output.contents, { level: GZIP_LEVEL }).byteLength,
  };
}

/** 번들 크기가 기준 해답의 (1 + epsilon)배 이하인지 판정한다. */
export function withinSizeBudget(measured: number, reference: number, epsilon: number): boolean {
  if (!(reference > 0)) throw new RangeError('기준 크기는 양수여야 한다');
  if (!(epsilon >= 0)) throw new RangeError('허용 오차는 0 이상이어야 한다');
  return measured <= reference * (1 + epsilon);
}
