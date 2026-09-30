import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Las avatares vienen comprimidas con meshopt (spec § 4.3): un GLTFLoader sin el decodificador
 *  revienta al abrirlas. Todo archivo de src/ que crea uno le registra MeshoptDecoder. */
describe('cargadores GLTF', () => {
  it('cada GLTFLoader de src/ decodifica meshopt', () => {
    const archivos = execFileSync('git', ['grep', '-l', 'new GLTFLoader(', '--', 'src'], { encoding: 'utf8' })
      .trim().split('\n').filter((f) => f && !f.includes('__tests__'));
    expect(archivos.length).toBeGreaterThanOrEqual(2);
    const sinDecodificador = archivos.filter((f) => !readFileSync(f, 'utf8').includes('setMeshoptDecoder(MeshoptDecoder)'));
    expect(sinDecodificador).toEqual([]);
  });
});
