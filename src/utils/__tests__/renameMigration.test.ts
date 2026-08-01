// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateFromOpenClo } from '../renameMigration';

describe('migrateFromOpenClo', () => {
  beforeEach(() => {
    localStorage.clear();
    // reset total de IndexedDB entre tests
    (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  });

  it('copia claves openclo* a vina* y elimina las viejas', async () => {
    localStorage.setItem('openclo-layout', '{"a":1}');
    localStorage.setItem('openclo_budget', '5');
    localStorage.setItem('otra-cosa', 'x');
    await migrateFromOpenClo();
    expect(localStorage.getItem('vina-layout')).toBe('{"a":1}');
    expect(localStorage.getItem('vina_budget')).toBe('5');
    expect(localStorage.getItem('openclo-layout')).toBeNull();
    expect(localStorage.getItem('otra-cosa')).toBe('x');
  });

  it('respeta las claves excluidas (fuentes de migradores legacy dedicados)', async () => {
    localStorage.setItem('openclo-autosave', 'legacy');
    localStorage.setItem('openclo-saved-poses', 'legacy');
    await migrateFromOpenClo();
    expect(localStorage.getItem('openclo-autosave')).toBe('legacy');
    expect(localStorage.getItem('openclo-saved-poses')).toBe('legacy');
    expect(localStorage.getItem('vina-autosave')).toBeNull();
  });

  it('la clave canónica gana si ya existe (no clobber)', async () => {
    localStorage.setItem('openclo-layout', 'vieja');
    localStorage.setItem('vina-layout', 'nueva');
    await migrateFromOpenClo();
    expect(localStorage.getItem('vina-layout')).toBe('nueva');
    expect(localStorage.getItem('openclo-layout')).toBeNull();
  });

  it('es one-shot: con el marker puesto no vuelve a tocar nada', async () => {
    await migrateFromOpenClo();
    localStorage.setItem('openclo-layout', 'tarde');
    await migrateFromOpenClo();
    expect(localStorage.getItem('vina-layout')).toBeNull();
    expect(localStorage.getItem('openclo-layout')).toBe('tarde');
  });

  it('clona la base IDB openclo → vina (datos + claves con prefijo reescrito) y borra la vieja (best-effort)', async () => {
    const old = await openDB('openclo', 1, {
      upgrade(db) { db.createObjectStore('kv'); },
    });
    await old.put('kv', { v: 1 }, 'openclo:settings:foo');
    await old.put('kv', { v: 2 }, 'proyecto-1');
    old.close();

    await migrateFromOpenClo();

    const nueva = await openDB('vina', 1);
    expect(await nueva.get('kv', 'vina:settings:foo')).toEqual({ v: 1 });
    expect(await nueva.get('kv', 'proyecto-1')).toEqual({ v: 2 });
    nueva.close();

    // deleteDB() is fire-and-forget (IMPORTANT #2, 2026-08-01 review) — it
    // must not gate rendering, so it isn't awaited by migrateFromOpenClo().
    // The clone/data correctness above is the real contract; deletion is
    // best-effort and only tolerantly (eventually) asserted here.
    await vi.waitFor(async () => {
      const dbs = await indexedDB.databases();
      expect(dbs.map(d => d.name)).not.toContain('openclo');
    });
  });

  it('si la base vieja no existía, no deja una base basura creada por el probe', async () => {
    // With the indexedDB.databases() pre-check (MINOR #6), cloneDb() is never
    // even called for a name that doesn't exist — deterministic, no probe DB
    // is ever created, so this no longer depends on the fire-and-forget delete.
    await migrateFromOpenClo();
    const dbs = await indexedDB.databases();
    expect(dbs.map(d => d.name)).not.toContain('openclo');
    expect(dbs.map(d => d.name)).not.toContain('openclo-reference-images');
  });

  it('clona stores con keyPath (skills): la clave viaja dentro del value', async () => {
    const old = await openDB('openclo_skills_v1', 1, {
      upgrade(db) { db.createObjectStore('skills', { keyPath: 'nsid' }); },
    });
    await old.put('skills', { nsid: 'openclo:bodice', enabled: true });
    old.close();

    await migrateFromOpenClo();

    const nueva = await openDB('vina_skills_v1', 1);
    expect(await nueva.get('skills', 'openclo:bodice')).toEqual({ nsid: 'openclo:bodice', enabled: true });
    nueva.close();
  });

  it('clona indexes de un store con keyPath (MINOR #5)', async () => {
    const old = await openDB('openclo_skills_v1', 1, {
      upgrade(db) {
        const store = db.createObjectStore('skills', { keyPath: 'nsid' });
        store.createIndex('source', 'source', { unique: false });
      },
    });
    await old.put('skills', { nsid: 'openclo:bodice', source: 'community' });
    old.close();

    await migrateFromOpenClo();

    const nueva = await openDB('vina_skills_v1', 1);
    const tx = nueva.transaction('skills', 'readonly');
    const index = tx.objectStore('skills').index('source');
    expect(index.keyPath).toBe('source');
    expect(index.unique).toBe(false);
    expect(await index.get('community')).toEqual({ nsid: 'openclo:bodice', source: 'community' });
    nueva.close();
  });
});
