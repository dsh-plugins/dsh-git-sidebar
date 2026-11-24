import pkg from './package.json' with { type: 'json' }

export default {
  entry: { client: 'src/client.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'chrome130',
  clean: false,
  dts: false,
  deps: { neverBundle: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', 'zod', '@dsh-plugin/dsh-loader/client'] },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
    codeSplitting: false,
  },
}
