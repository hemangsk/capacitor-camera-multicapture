import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'dist/esm/index.js',
  output: [
    {
      file: 'dist/plugin.js',
      format: 'iife',
      name: 'capacitorCameraMultiCapture',
      globals: {
        '@capacitor/core': 'capacitorExports',
        'lodash': 'lodash',
      },
      sourcemap: true,
      inlineDynamicImports: true,
    },
    {
      file: 'dist/plugin.cjs.js',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
  plugins: [
    resolve({
      extensions: ['.js', '.ts', '.mjs'],
    }),
  ],
  external: ['@capacitor/core', 'lodash'],
};
