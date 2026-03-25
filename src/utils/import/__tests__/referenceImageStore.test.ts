import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  storeImageBlob,
  loadImageBlob,
  removeImageBlob,
  clearAllImageBlobs,
  garbageCollect,
  _resetDbForTesting,
} from '../referenceImageStore';

// Reset the cached DB connection before each test so each test gets a fresh DB state.
beforeEach(async () => {
  await clearAllImageBlobs();
  _resetDbForTesting();
});

function makeBlob(content: string, type = 'image/png'): Blob {
  return new Blob([content], { type });
}

async function blobToText(blob: Blob): Promise<string> {
  return blob.text();
}

describe('referenceImageStore', () => {
  it('storeImageBlob + loadImageBlob round-trip', async () => {
    const blob = makeBlob('fake-image-data');
    await storeImageBlob('img-1', blob);

    const loaded = await loadImageBlob('img-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.type).toBe('image/png');
    const text = await blobToText(loaded!);
    expect(text).toBe('fake-image-data');
  });

  it('loadImageBlob returns null for missing id', async () => {
    const result = await loadImageBlob('nonexistent-id');
    expect(result).toBeNull();
  });

  it('removeImageBlob clears entry', async () => {
    const blob = makeBlob('data');
    await storeImageBlob('img-2', blob);

    await removeImageBlob('img-2');

    const result = await loadImageBlob('img-2');
    expect(result).toBeNull();
  });

  it('clearAllImageBlobs removes everything', async () => {
    await storeImageBlob('img-a', makeBlob('a'));
    await storeImageBlob('img-b', makeBlob('b'));
    await storeImageBlob('img-c', makeBlob('c'));

    await clearAllImageBlobs();

    expect(await loadImageBlob('img-a')).toBeNull();
    expect(await loadImageBlob('img-b')).toBeNull();
    expect(await loadImageBlob('img-c')).toBeNull();
  });

  it('garbageCollect removes blobs not in active ids', async () => {
    await storeImageBlob('active-1', makeBlob('keep'));
    await storeImageBlob('stale-1', makeBlob('remove'));
    await storeImageBlob('stale-2', makeBlob('remove'));

    await garbageCollect(['active-1']);

    expect(await loadImageBlob('active-1')).not.toBeNull();
    expect(await loadImageBlob('stale-1')).toBeNull();
    expect(await loadImageBlob('stale-2')).toBeNull();
  });

  it('garbageCollect keeps active blobs', async () => {
    await storeImageBlob('img-x', makeBlob('x-data'));
    await storeImageBlob('img-y', makeBlob('y-data'));

    await garbageCollect(['img-x', 'img-y']);

    const x = await loadImageBlob('img-x');
    const y = await loadImageBlob('img-y');
    expect(x).not.toBeNull();
    expect(y).not.toBeNull();
    const xText = await blobToText(x!);
    const yText = await blobToText(y!);
    expect(xText).toBe('x-data');
    expect(yText).toBe('y-data');
  });
});
