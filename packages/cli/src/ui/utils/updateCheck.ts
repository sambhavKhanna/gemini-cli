/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import updateNotifier from 'update-notifier';
import semver from 'semver';
import { getPackageJson } from '../../utils/package.js';
import * as child_process from 'child_process';

export async function checkForUpdates(): Promise<string | null> {
  try {
    // Skip update check when running from source (development mode)
    if (process.env.DEV === 'true') {
      return null;
    }

    const packageJson = await getPackageJson();
    if (!packageJson || !packageJson.name || !packageJson.version) {
      return null;
    }
    const notifier = updateNotifier({
      pkg: {
        name: packageJson.name,
        version: packageJson.version,
      },
      updateCheckInterval: 1000 * 60 * 60 * 24,
      // allow notifier to run in scripts
      shouldNotifyInNpmScript: true,
    });

    if (
      notifier.update &&
      semver.gt(notifier.update.latest, notifier.update.current)
    ) {
      return `Gemini CLI update available! ${notifier.update.current} → ${notifier.update.latest}`;
    }

    return null;
  } catch (e) {
    console.warn('Failed to check for updates: ' + e);
    return null;
  }
}

export function applyUpdate(): Promise<void> {
  return new Promise((resolve, reject) => {
    getPackageJson()
      .then((packageJson) => {
        if (!packageJson || !packageJson.name) {
          return resolve();
        }
        const child = child_process.spawn(
          'npm',
          ['install', '-g', packageJson.name],
          {
            stdio: 'inherit',
          },
        );

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Update failed with exit code ${code}`));
          }
        });

        child.on('error', (err) => {
          reject(err);
        });
      })
      .catch(reject);
  });
}
