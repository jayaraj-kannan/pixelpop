import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real save logic with device APIs mocked; no native device in CI.
const source = readFileSync(new URL('../src/lib/photo-library.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function setup({ granted = true, canAskAgain = true, requested, exists = true, saveError } = {}) {
  const calls = [];
  const media = {
    getPermissionsAsync: async (...args) => {
      // Model the native Android Expo Go guard, which runs before writeOnly
      // filtering and rejects photo/video scopes even when no read is needed.
      if (args[1]?.some((scope) => scope === 'photo' || scope === 'video')) {
        throw new Error('Expo Go cannot request photo/video library read permissions');
      }
      calls.push(['check', ...args]);
      return { granted, canAskAgain };
    },
    requestPermissionsAsync: async (...args) => {
      if (args[1]?.some((scope) => scope === 'photo' || scope === 'video')) {
        throw new Error('Expo Go cannot request photo/video library read permissions');
      }
      calls.push(['request', ...args]);
      return requested ?? { granted: true, canAskAgain: true };
    },
    saveToLibraryAsync: async (uri) => {
      calls.push(['save', uri]);
      if (saveError) throw saveError;
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => {
      if (name === 'expo-media-library/legacy') return media;
      if (name === 'expo-file-system/legacy') return { getInfoAsync: async () => ({ exists }) };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { ...exports, calls };
}

for (const format of ['png', 'gif']) {
  const api = setup();
  const uri = `file:///documents/PixelPop/art.${format}`;
  await api.saveExportToPhotos(uri);
  assert.deepEqual(api.calls.map((call) => call[0]), ['check', 'save']);
  assert.equal(api.calls.at(-1)[1], uri, 'Must save the original export file');
  assert.equal(api.calls[0][1], true, 'Request add-only access');
  assert.equal(JSON.stringify(api.calls[0][2]), '[]', 'No read scopes; compatible with Android Expo Go');
}
{
  const api = setup({ granted: false });
  await api.saveExportToPhotos('file:///art.png');
  assert.deepEqual(api.calls.map((call) => call[0]), ['check', 'request', 'save']);
}
for (const canAskAgain of [true, false]) {
  const api = setup({
    granted: false, canAskAgain,
    requested: { granted: false, canAskAgain },
  });
  await assert.rejects(api.saveExportToPhotos('file:///art.gif'), (error) =>
    error instanceof api.PhotosPermissionError && error.canAskAgain === canAskAgain);
  assert.ok(!api.calls.some(([name]) => name === 'save'));
  assert.equal(api.calls.some(([name]) => name === 'request'), canAskAgain);
}
{
  const api = setup({ exists: false });
  await assert.rejects(api.saveExportToPhotos('file:///missing.png'), /no longer on your device/);
  assert.deepEqual(api.calls, [], 'Missing exports must not request permission');
}
{
  const api = setup({ saveError: new Error('Device storage is full') });
  await assert.rejects(api.saveExportToPhotos('file:///art.gif'), /storage is full/);
}
console.log('Photo-library checks passed: PNG, GIF, add-only access, permission request/denial, missing file, save failure.');
