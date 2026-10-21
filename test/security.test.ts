import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';
import { validatePackageZip } from '../src/server/packager/validator.js';
import { hashPassword, verifyPassword } from '../src/server/auth/auth.js';

describe('Security & Validation Tests', () => {
  it('should reject ZIP packages containing ZIP Slip path traversal (../evil.json)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozmetics-sec-'));
    const zipPath = path.join(tmpDir, 'slip.zip');

    try {
      // Create raw zip with ../evil.json entry
      execFileSync('python3', [
        '-c',
        `import zipfile
with zipfile.ZipFile("${zipPath}", "w") as z:
    z.writestr("../evil.json", "evil payload")
    z.writestr("manifest.json", "{}")
`
      ]);

      const res = validatePackageZip(zipPath);
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('Malicious path detected') || res.errors.includes('ZIP slip attempt'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should reject ZIP packages containing absolute paths (/evil.json)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozmetics-sec-'));
    const zipPath = path.join(tmpDir, 'abs-slip.zip');

    try {
      execFileSync('python3', [
        '-c',
        `import zipfile
with zipfile.ZipFile("${zipPath}", "w") as z:
    z.writestr("/etc/passwd", "root:x:0:0")
    z.writestr("manifest.json", "{}")
`
      ]);

      const res = validatePackageZip(zipPath);
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('Malicious path detected') || res.errors.includes('ZIP slip attempt'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should reject packages with disallowed file extensions (.exe)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozmetics-sec-'));
    const zipPath = path.join(tmpDir, 'exe.zip');

    try {
      const zip = new AdmZip();
      zip.addFile('manifest.json', Buffer.from('{}', 'utf8'));
      zip.addFile('payload.exe', Buffer.from([0, 1, 2, 3]));
      zip.writeZip(zipPath);

      const res = validatePackageZip(zipPath);
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('Disallowed file type'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should reject packages exceeding entry count limit (> 60 entries)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozmetics-sec-'));
    const zipPath = path.join(tmpDir, 'too-many.zip');

    try {
      const zip = new AdmZip();
      zip.addFile('manifest.json', Buffer.from('{}', 'utf8'));
      for (let i = 0; i < 65; i++) {
        zip.addFile(`file_${i}.json`, Buffer.from('{}', 'utf8'));
      }
      zip.writeZip(zipPath);

      const res = validatePackageZip(zipPath);
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('too many entries'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should reject packages missing manifest.json', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozmetics-sec-'));
    const zipPath = path.join(tmpDir, 'no-manifest.zip');

    try {
      const zip = new AdmZip();
      zip.addFile('model.geo.json', Buffer.from('{}', 'utf8'));
      zip.addFile('texture.png', Buffer.from([0, 0, 0, 0]));
      zip.writeZip(zipPath);

      const res = validatePackageZip(zipPath);
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes("Missing required 'manifest.json'"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should reject empty package files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozmetics-sec-'));
    const zipPath = path.join(tmpDir, 'empty.zip');

    try {
      fs.writeFileSync(zipPath, Buffer.alloc(0));
      const res = validatePackageZip(zipPath);
      assert.strictEqual(res.valid, false);
      assert.ok(res.message.includes('empty'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should securely hash and verify passwords using scrypt', () => {
    const pass = 'SuperSecret123!';
    const { hash, salt } = hashPassword(pass);

    assert.ok(hash && hash.length === 128); // 64 bytes hex = 128 chars
    assert.strictEqual(verifyPassword(pass, hash, salt), true);
    assert.strictEqual(verifyPassword('WrongPassword', hash, salt), false);
  });
});
