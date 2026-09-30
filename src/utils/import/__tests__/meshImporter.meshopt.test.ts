// @vitest-environment jsdom
// jsdom: el FileLoader de three construye ProgressEvent, que node no tiene.
import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { importMesh } from '../meshImporter';

/** Una GLB de un triángulo, comprimida como las de la biblioteca (`generar-todas.mjs`). */
async function glbConMeshopt(): Promise<string> {
  const doc = new Document();
  const buf = doc.createBuffer();
  const posiciones = doc.createAccessor().setType('VEC3').setBuffer(buf)
    .setArray(new Float32Array([0, 0, 0, 0.5, 0, 0, 0, 1.7, 0]));
  const indices = doc.createAccessor().setType('SCALAR').setBuffer(buf).setArray(new Uint16Array([0, 1, 2]));
  const prim = doc.createPrimitive().setAttribute('POSITION', posiciones).setIndices(indices);
  doc.createScene().addChild(doc.createNode('cuerpo').setMesh(doc.createMesh().addPrimitive(prim)));
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = await io.writeBinary(doc);
  return `data:model/gltf-binary;base64,${Buffer.from(glb).toString('base64')}`;
}

describe('importMesh con meshopt', () => {
  it('abre una GLB comprimida con meshopt, como las de la biblioteca', async () => {
    const r = await importMesh(await glbConMeshopt(), 'cuerpo.glb');
    let vertices = 0;
    r.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) vertices += (o as THREE.Mesh).geometry.attributes.position.count; });
    expect(vertices).toBe(3);
  });
});
