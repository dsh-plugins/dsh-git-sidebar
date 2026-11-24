/** 构建 Node.js 宿主入口。浏览器入口由 tsdown 构建。 */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-typert-protocol', '@dsh-plugin/dsh-loader'],
})
