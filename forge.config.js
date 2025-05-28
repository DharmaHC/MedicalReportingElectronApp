/* forge.config.js --------------------------------------------------- */

const { VitePlugin }  = require('@electron-forge/plugin-vite');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');


module.exports = {
  /* ---------------------------------------------------------------- */
  packagerConfig: { asar: true },
  extraResource: ['assets'],
  makers: [
    { name: '@electron-forge/maker-squirrel' },
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    { name: '@electron-forge/maker-deb' },
    { name: '@electron-forge/maker-rpm' }
  ],

  plugins: [
    /* ---------- Vite + Electron ----------------------------------- */
    new VitePlugin({
      /* Build dei processi Main / Preload -------------------------- */
      build: [
        {
          entry : 'src/main/index.ts',        // <--  tuo file main
          config: 'vite.main.config.mjs',
          target: 'main'
        },
        {
          entry : 'preload/index.ts',     // <--  tuo preload
          config: 'vite.preload.config.mjs',
          target: 'preload'
        }
      ],
      /* Build del Renderer (React) -------------------------------- */
      renderer: [
        {
          name  : 'main_window',
          config: 'vite.renderer.config.mjs'
        }
      ]
    }),

    /* ---------- Fuses (hardening) -------------------------------- */
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]                         : false,
      [FuseV1Options.EnableCookieEncryption]            : true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]     : false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]               : true
    })
  ]
};
