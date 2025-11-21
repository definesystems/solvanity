import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { readFile, unlink, access } from 'fs/promises';
import { join } from 'path';
import bip39 from 'bip39-light';
import bs58 from 'bs58';

/**
 * Solvanity Test Suite
 *
 * This test suite validates core functionality including:
 * - Base58 validation
 * - Mnemonic generation and validation
 * - Address generation with prefix/suffix
 * - File operations (split, convert)
 * - Input validation
 * - CLI interface
 */

// Helper function to run CLI commands
function runCLI(args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bun', ['solvanity.js', ...args], {
      cwd: process.cwd(),
      ...options
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', (error) => {
      reject(error);
    });

    // Allow process to be killed by tests
    if (options.timeout) {
      setTimeout(() => {
        proc.kill('SIGTERM');
      }, options.timeout);
    }
  });
}

// Helper to check if file exists
async function fileExists(filepath) {
  try {
    await access(filepath);
    return true;
  } catch {
    return false;
  }
}

// Helper to clean up generated files
async function cleanupFiles(pattern) {
  const { readdir } = await import('fs/promises');
  const files = await readdir('address');
  const toDelete = files.filter(f => f !== '.gitkeep');

  for (const file of toDelete) {
    try {
      await unlink(join('address', file));
    } catch (err) {
      // Ignore errors
    }
  }
}

describe('Base58 Validation', () => {
  it('should validate correct Base58 characters', () => {
    const regex = /^[1-9A-HJ-NP-Za-km-z]*$/;

    // Valid Base58 strings (no 0, O, I, l)
    expect(regex.test('abc')).toBe(true);
    expect(regex.test('123')).toBe(true);
    expect(regex.test('test')).toBe(true);
    expect(regex.test('ABC')).toBe(true);
    expect(regex.test('xyz')).toBe(true);
  });

  it('should reject invalid Base58 characters', () => {
    const regex = /^[1-9A-HJ-NP-Za-km-z]*$/;

    // Invalid characters: 0, O, I, l
    expect(regex.test('0')).toBe(false);
    expect(regex.test('O')).toBe(false);
    expect(regex.test('I')).toBe(false);
    expect(regex.test('l')).toBe(false);
    expect(regex.test('sol0')).toBe(false);
    expect(regex.test('abcO')).toBe(false);
  });
});

describe('Mnemonic Generation', () => {
  it('should generate valid 12-word BIP39 mnemonics', () => {
    const mnemonic = bip39.generateMnemonic(128); // 128 bits = 12 words
    const words = mnemonic.split(' ');

    expect(words.length).toBe(12);
    expect(bip39.validateMnemonic(mnemonic)).toBe(true);
  });

  it('should validate correct mnemonics', () => {
    const validMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    expect(bip39.validateMnemonic(validMnemonic)).toBe(true);
  });

  it('should reject invalid mnemonics', () => {
    const invalidMnemonic = 'invalid mnemonic phrase test words here and more words still';
    expect(bip39.validateMnemonic(invalidMnemonic)).toBe(false);
  });
});

describe('CLI Help and Version', () => {
  it('should display help information', async () => {
    const { code, stdout } = await runCLI(['--help']);

    expect(code).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Options:');
  });

  it('should display version information', async () => {
    const { code, stdout } = await runCLI(['--version']);

    expect(code).toBe(0);
    expect(stdout).toContain('1.5.3');
  });
});

describe('Input Validation', () => {
  it('should reject prefix longer than 7 characters', async () => {
    const { code, stderr } = await runCLI(['-p', 'toolongprefix', '-n', '1']);

    expect(code).not.toBe(0);
    expect(stderr.toLowerCase()).toContain('prefix');
  });

  it('should reject suffix longer than 7 characters', async () => {
    const { code, stderr } = await runCLI(['-x', 'toolongsuffix', '-n', '1']);

    expect(code).not.toBe(0);
    expect(stderr.toLowerCase()).toContain('suffix');
  });

  it('should reject invalid Base58 characters in prefix', async () => {
    const { code, stderr } = await runCLI(['-p', 'test0', '-n', '1']); // 0 is invalid

    expect(code).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/(base58|invalid)/i);
  });

  it('should reject invalid Base58 characters in suffix', async () => {
    const { code, stderr } = await runCLI(['-x', 'testO', '-n', '1']); // O is invalid

    expect(code).not.toBe(0);
    expect(stderr.toLowerCase()).toMatch(/(base58|invalid)/i);
  });

  it('should reject negative thread count', async () => {
    const { code, stderr } = await runCLI(['-t', '-5', '-n', '1']);

    expect(code).not.toBe(0);
    expect(stderr.toLowerCase()).toContain('thread');
  });

  it('should reject invalid output mode', async () => {
    const { code, stderr } = await runCLI(['-o', 'invalid', '-n', '1']);

    expect(code).not.toBe(0);
    expect(stderr.toLowerCase()).toContain('output');
  });
});

describe('Address Generation', () => {
  beforeEach(async () => {
    await cleanupFiles();
  });

  afterEach(async () => {
    await cleanupFiles();
  });

  it('should generate addresses with display output mode', async () => {
    const { code, stdout } = await runCLI(['-n', '1', '-o', 'display'], { timeout: 10000 });

    expect(code).toBe(0);
    expect(stdout).toBeTruthy();

    // Verify no files were created
    const { readdir } = await import('fs/promises');
    const files = await readdir('address');
    expect(files.filter(f => f !== '.gitkeep').length).toBe(0);
  }, 15000);

  it('should generate addresses with combined output mode', async () => {
    const { code } = await runCLI(['-n', '1', '-o', 'combined', '-f', 'json'], { timeout: 10000 });

    expect(code).toBe(0);

    // Verify file was created
    const { readdir } = await import('fs/promises');
    const files = await readdir('address');
    const addressFiles = files.filter(f => f.endsWith('-address.json'));

    expect(addressFiles.length).toBeGreaterThan(0);

    // Verify file content
    const content = await readFile(join('address', addressFiles[0]), 'utf-8');
    const data = JSON.parse(content);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0]).toHaveProperty('address');
    expect(data[0]).toHaveProperty('mnemonic');
    expect(data[0].address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(data[0].mnemonic.split(' ').length).toBe(12);
  }, 15000);

  it('should generate addresses with split output mode', async () => {
    const { code } = await runCLI(['-n', '2', '-o', 'split', '-f', 'json'], { timeout: 10000 });

    expect(code).toBe(0);

    // Verify both files were created
    const { readdir } = await import('fs/promises');
    const files = await readdir('address');
    const addressFiles = files.filter(f => f.endsWith('-address.json'));
    const secretFiles = files.filter(f => f.endsWith('-secret-mnemonics.json'));

    expect(addressFiles.length).toBeGreaterThan(0);
    expect(secretFiles.length).toBeGreaterThan(0);

    // Verify address file content
    const addressContent = await readFile(join('address', addressFiles[0]), 'utf-8');
    const addresses = JSON.parse(addressContent);
    expect(Array.isArray(addresses)).toBe(true);
    expect(addresses.length).toBe(2);

    // Verify secret file content
    const secretContent = await readFile(join('address', secretFiles[0]), 'utf-8');
    const secrets = JSON.parse(secretContent);
    expect(Array.isArray(secrets)).toBe(true);
    expect(secrets.length).toBe(2);
    expect(secrets[0].split(' ').length).toBe(12);
  }, 15000);

  it('should generate addresses with TXT format', async () => {
    const { code } = await runCLI(['-n', '1', '-o', 'combined', '-f', 'txt'], { timeout: 10000 });

    expect(code).toBe(0);

    // Verify file was created
    const { readdir } = await import('fs/promises');
    const files = await readdir('address');
    const txtFiles = files.filter(f => f.endsWith('-address.txt'));

    expect(txtFiles.length).toBeGreaterThan(0);

    // Verify file content (should be address:mnemonic format)
    const content = await readFile(join('address', txtFiles[0]), 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(1);
    expect(lines[0]).toContain(':');

    const [address, mnemonic] = lines[0].split(':');
    expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    expect(mnemonic.split(' ').length).toBe(12);
  }, 15000);

  it('should generate addresses with 1-character prefix quickly', async () => {
    const startTime = Date.now();
    const { code, stdout } = await runCLI(['-p', 'a', '-n', '1', '-o', 'display'], { timeout: 10000 });
    const duration = Date.now() - startTime;

    expect(code).toBe(0);
    expect(duration).toBeLessThan(10000); // Should be relatively fast
    expect(stdout.toUpperCase()).toContain('GENERATED'); // Should have generated addresses
  }, 15000);
});

describe('Distribution Command', () => {
  beforeEach(async () => {
    await cleanupFiles();
  });

  afterEach(async () => {
    await cleanupFiles();
  });

  it('should generate distribution with correct total', async () => {
    const { code } = await runCLI(['distribute', '-a', '1000', '-w', '10', '-f', 'json'], { timeout: 5000 });

    expect(code).toBe(0);

    // Verify file was created
    const { readdir } = await import('fs/promises');
    const files = await readdir('address');
    const distFiles = files.filter(f => f.includes('-distribution.json'));

    expect(distFiles.length).toBeGreaterThan(0);

    // Verify distribution
    const content = await readFile(join('address', distFiles[0]), 'utf-8');
    const data = JSON.parse(content);

    expect(data.metadata.totalAmount).toBe(1000);
    expect(data.metadata.wallets).toBe(10);
    expect(data.distribution.length).toBe(10);
    expect(data.statistics.total).toBe(1000);

    // Sum should equal total
    const sum = data.distribution.reduce((a, b) => a + b, 0);
    expect(sum).toBe(1000);
  }, 10000);

  it('should respect min and max constraints', async () => {
    const { code } = await runCLI(['distribute', '-a', '1000', '-w', '10', '--min', '50', '--max', '150', '-f', 'json'], { timeout: 5000 });

    expect(code).toBe(0);

    const { readdir } = await import('fs/promises');
    const files = await readdir('address');
    const distFiles = files.filter(f => f.includes('-distribution.json'));

    const content = await readFile(join('address', distFiles[0]), 'utf-8');
    const data = JSON.parse(content);

    // All values should be within min/max range
    data.distribution.forEach(value => {
      expect(value).toBeGreaterThanOrEqual(50);
      expect(value).toBeLessThanOrEqual(150);
    });
  }, 10000);

  it('should generate unique values when requested', async () => {
    const { code } = await runCLI(['distribute', '-a', '1000', '-w', '10', '--unique', '-f', 'json'], { timeout: 5000 });

    expect(code).toBe(0);

    const { readdir } = await import('fs/promises');
    const files = await readdir('address');
    const distFiles = files.filter(f => f.includes('-distribution.json'));

    const content = await readFile(join('address', distFiles[0]), 'utf-8');
    const data = JSON.parse(content);

    // All values should be unique
    const uniqueValues = new Set(data.distribution);
    expect(uniqueValues.size).toBe(data.distribution.length);
    expect(data.statistics.unique).toBe(10);
  }, 10000);
});

describe('File Format Support', () => {
  it('should support both JSON and TXT formats', async () => {
    const formats = ['json', 'txt'];

    for (const format of formats) {
      await cleanupFiles();

      const { code } = await runCLI(['-n', '1', '-f', format, '-o', 'combined'], { timeout: 10000 });
      expect(code).toBe(0);

      const { readdir } = await import('fs/promises');
      const files = await readdir('address');
      const outputFiles = files.filter(f => f.endsWith(`-address.${format}`));

      expect(outputFiles.length).toBeGreaterThan(0);
    }

    await cleanupFiles();
  }, 25000);
});

describe('Performance and Statistics', () => {
  it('should generate statistics when requested', async () => {
    const { code, stdout } = await runCLI(['-n', '1', '-s', '-o', 'display'], { timeout: 10000 });

    expect(code).toBe(0);
    // Statistics output includes timing information
    expect(stdout.toLowerCase()).toMatch(/(generated|seconds|cpu)/);
  }, 15000);
});
