import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import type { ForgeConfig } from '@electron-forge/shared-types';

import { isPackagedPathIgnored } from './scripts/forge-packaging.ts';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      // Sharp 的 .node 依赖同目录 DLL，必须连同平台原生包整体解包。
      unpack: '**/node_modules/{playwright,playwright-core,@img/sharp-*}/**',
    },
    ignore: (targetPath) => isPackagedPathIgnored(targetPath, configDirectory),
    junk: true,
    overwrite: true,
    prune: true,
    protocols: [
      {
        name: '矩阵特工队 Deep Link',
        schemes: ['agenthunt'],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {},
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
