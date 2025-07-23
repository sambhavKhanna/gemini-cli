/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkForUpdates, applyUpdate } from './updateCheck.js';
import * as child_process from 'child_process';
import EventEmitter from 'events';
import type { ChildProcess } from 'child_process';

const getPackageJson = vi.hoisted(() => vi.fn());
vi.mock('../../utils/package.js', () => ({
  getPackageJson,
}));

const updateNotifier = vi.hoisted(() => vi.fn());
vi.mock('update-notifier', () => ({
  default: updateNotifier,
}));

vi.mock('child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('child_process');
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

describe('updateCheck', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Clear DEV environment variable before each test
    delete process.env.DEV;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkForUpdates', () => {
    it('should return null when running from source (DEV=true)', async () => {
      process.env.DEV = 'true';
      getPackageJson.mockResolvedValue({
        name: 'test-package',
        version: '1.0.0',
      });
      updateNotifier.mockReturnValue({
        update: { current: '1.0.0', latest: '1.1.0' },
      });
      const result = await checkForUpdates();
      expect(result).toBeNull();
      expect(getPackageJson).not.toHaveBeenCalled();
      expect(updateNotifier).not.toHaveBeenCalled();
    });

    it('should return null if package.json is missing', async () => {
      getPackageJson.mockResolvedValue(null);
      const result = await checkForUpdates();
      expect(result).toBeNull();
    });

    it('should return null if there is no update', async () => {
      getPackageJson.mockResolvedValue({
        name: 'test-package',
        version: '1.0.0',
      });
      updateNotifier.mockReturnValue({ update: null });
      const result = await checkForUpdates();
      expect(result).toBeNull();
    });

    it('should return a message if a newer version is available', async () => {
      getPackageJson.mockResolvedValue({
        name: 'test-package',
        version: '1.0.0',
      });
      updateNotifier.mockReturnValue({
        update: { current: '1.0.0', latest: '1.1.0' },
      });
      const result = await checkForUpdates();
      expect(result).toContain('1.0.0 → 1.1.0');
    });

    it('should return null if the latest version is the same as the current version', async () => {
      getPackageJson.mockResolvedValue({
        name: 'test-package',
        version: '1.0.0',
      });
      updateNotifier.mockReturnValue({
        update: { current: '1.0.0', latest: '1.0.0' },
      });
      const result = await checkForUpdates();
      expect(result).toBeNull();
    });

    it('should return null if the latest version is older than the current version', async () => {
      getPackageJson.mockResolvedValue({
        name: 'test-package',
        version: '1.1.0',
      });
      updateNotifier.mockReturnValue({
        update: { current: '1.1.0', latest: '1.0.0' },
      });
      const result = await checkForUpdates();
      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      getPackageJson.mockRejectedValue(new Error('test error'));
      const result = await checkForUpdates();
      expect(result).toBeNull();
    });
  });

  describe('applyUpdate', () => {
    it('should resolve if package.json is missing', async () => {
      getPackageJson.mockResolvedValue(null);
      await expect(applyUpdate()).resolves.toBeUndefined();
      expect(child_process.spawn).not.toHaveBeenCalled();
    });

    it('should call spawn with the correct arguments', async () => {
      const mockChild = new EventEmitter() as ChildProcess;
      vi.spyOn(child_process, 'spawn').mockReturnValue(mockChild);
      getPackageJson.mockResolvedValue({ name: 'test-package' });

      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 100);

      await applyUpdate();

      expect(child_process.spawn).toHaveBeenCalledWith(
        'npm',
        ['install', '-g', 'test-package'],
        {
          stdio: 'inherit',
        },
      );
    });

    it('should resolve when the child process exits with code 0', async () => {
      const mockChild = new EventEmitter() as ChildProcess;
      vi.spyOn(child_process, 'spawn').mockReturnValue(mockChild);
      getPackageJson.mockResolvedValue({ name: 'test-package' });

      const promise = applyUpdate();

      setTimeout(() => {
        mockChild.emit('close', 0);
      }, 0);

      await expect(promise).resolves.toBeUndefined();
    });

    it('should reject when the child process exits with a non-zero code', async () => {
      const mockChild = new EventEmitter() as ChildProcess;
      vi.spyOn(child_process, 'spawn').mockReturnValue(mockChild);
      getPackageJson.mockResolvedValue({ name: 'test-package' });

      const promise = applyUpdate();

      setTimeout(() => {
        mockChild.emit('close', 1);
      }, 0);

      await expect(promise).rejects.toThrow('Update failed with exit code 1');
    });

    it('should reject when the child process emits an error', async () => {
      const mockChild = new EventEmitter() as ChildProcess;
      const testError = new Error('Test error');
      vi.spyOn(child_process, 'spawn').mockReturnValue(mockChild);
      getPackageJson.mockResolvedValue({ name: 'test-package' });

      const promise = applyUpdate();

      setTimeout(() => {
        mockChild.emit('error', testError);
      }, 0);

      await expect(promise).rejects.toThrow(testError);
    });

    it('should reject if getPackageJson rejects', async () => {
      const testError = new Error('Failed to get package.json');
      getPackageJson.mockRejectedValue(testError);
      await expect(applyUpdate()).rejects.toThrow(testError);
    });
  });
});
