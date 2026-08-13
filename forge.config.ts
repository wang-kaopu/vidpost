import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import type { ForgeConfig } from '@electron-forge/shared-types';

import { isPackagedPathAllowed } from './scripts/forge-packaging.ts';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{playwright,playwright-core,sharp,@img}/**',
    },
    ignore: (targetPath) => !isPackagedPathAllowed(targetPath, configDirectory),
    junk: true,
    overwrite: true,
    prune: true,
    protocols: [
      {
        name: 'VidPost Deep Link',
        schemes: ['vidpost'],
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
