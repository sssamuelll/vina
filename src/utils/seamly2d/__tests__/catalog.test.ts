import { describe, it, expect } from 'vitest';
import { getCatalog, searchCatalog, getCatalogEntry, getCatalogByCategory, getCatalogByGender } from '../catalog';
import { getSizeMeasurements, buildMeasurements, inferSizeSystem, getAvailableSizes } from '../sizeTables';

describe('catalog', () => {
  it('returns usable entries only', () => {
    const all = getCatalog();
    expect(all.length).toBeGreaterThan(10);
    expect(all.every(e => e.usable)).toBe(true);
  });

  it('finds male shirt by English keyword', () => {
    const results = searchCatalog('shirt');
    expect(results.some(r => r.id === 'male_shirt')).toBe(true);
  });

  it('finds blouse by Spanish keyword', () => {
    const results = searchCatalog('blusa');
    expect(results.some(r => r.id === 'patron_blusa')).toBe(true);
  });

  it('finds trousers by German keyword', () => {
    const results = searchCatalog('hose');
    expect(results.some(r => r.id === 'trousers')).toBe(true);
  });

  it('gets entry by ID', () => {
    const entry = getCatalogEntry('trousers');
    expect(entry).toBeDefined();
    expect(entry!.category).toBe('bottoms');
  });

  it('filters by category', () => {
    const tops = getCatalogByCategory('tops');
    expect(tops.every(e => e.category === 'tops')).toBe(true);
    expect(tops.length).toBeGreaterThan(0);
  });

  it('filters by gender (includes unisex)', () => {
    const women = getCatalogByGender('women');
    expect(women.every(e => e.gender === 'women' || e.gender === 'unisex')).toBe(true);
  });
});

describe('sizeTables', () => {
  it('returns measurements for women M', () => {
    const m = getSizeMeasurements('M', 'eu-women');
    expect(m).toBeDefined();
    expect(m!.chest).toBe(920);
    expect(m!.waist).toBe(740);
  });

  it('returns measurements for men L', () => {
    const m = getSizeMeasurements('L', 'eu-men');
    expect(m).toBeDefined();
    expect(m!.chest).toBe(1040);
  });

  it('builds full measurements with overrides', () => {
    const m = buildMeasurements('S', 'eu-women', { chest: 900 });
    expect(m.chest).toBe(900); // Override applied
    expect(m.height).toBe(1680); // From size table
    expect(m.inseam).toBe(780);
  });

  it('infers size system from gender', () => {
    expect(inferSizeSystem('men')).toBe('eu-men');
    expect(inferSizeSystem('women')).toBe('eu-women');
    expect(inferSizeSystem('children')).toBe('eu-children');
  });

  it('lists all standard sizes', () => {
    const sizes = getAvailableSizes('eu-women');
    expect(sizes).toContain('S');
    expect(sizes).toContain('M');
    expect(sizes).toContain('XL');
    expect(sizes.length).toBe(8);
  });
});
