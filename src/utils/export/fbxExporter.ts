/**
 * FBX 7.4 Binary Exporter — export 3D mesh data as FBX binary.
 *
 * Minimal exporter producing valid FBX 7.4 binary files that
 * open in Blender, Maya, and other DCC tools. Supports static
 * triangle meshes with normals.
 *
 * @module fbxExporter
 */

import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export interface FBXExportOptions {
  /** Scale factor applied to positions (default 1.0) */
  scale?: number;
  /** Filename without extension (for downloadFBX) */
  filename?: string;
}

/**
 * Export a THREE.js scene/group as FBX 7.4 binary ArrayBuffer.
 */
export function exportToFBX(
  object: THREE.Object3D,
  options: FBXExportOptions = {},
): ArrayBuffer {
  const { scale = 1.0 } = options;

  // Collect meshes
  const meshes: Array<{
    name: string;
    positions: Float64Array;
    normals: Float64Array;
    indices: Int32Array;
  }> = [];

  object.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geo = obj.geometry as THREE.BufferGeometry;
    if (!geo || !geo.attributes.position) return;

    const posAttr = geo.attributes.position;
    const normalAttr = geo.attributes.normal;
    const index = geo.index;
    const worldMatrix = obj.matrixWorld;

    // Positions (apply world transform + scale)
    const positions = new Float64Array(posAttr.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v.applyMatrix4(worldMatrix);
      v.multiplyScalar(scale);
      positions[i * 3] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
    }

    // Normals (apply normal matrix)
    const normals = new Float64Array(posAttr.count * 3);
    if (normalAttr) {
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);
      const n = new THREE.Vector3();
      for (let i = 0; i < normalAttr.count; i++) {
        n.set(normalAttr.getX(i), normalAttr.getY(i), normalAttr.getZ(i));
        n.applyMatrix3(normalMatrix).normalize();
        normals[i * 3] = n.x;
        normals[i * 3 + 1] = n.y;
        normals[i * 3 + 2] = n.z;
      }
    }

    // Indices — FBX polygon encoding: last index per face is -(idx + 1)
    let triCount: number;
    let indices: Int32Array;
    if (index) {
      triCount = index.count / 3;
      indices = new Int32Array(index.count);
      for (let i = 0; i < triCount; i++) {
        indices[i * 3] = index.getX(i * 3);
        indices[i * 3 + 1] = index.getX(i * 3 + 1);
        indices[i * 3 + 2] = -(index.getX(i * 3 + 2) + 1);
      }
    } else {
      triCount = posAttr.count / 3;
      indices = new Int32Array(posAttr.count);
      for (let i = 0; i < triCount; i++) {
        indices[i * 3] = i * 3;
        indices[i * 3 + 1] = i * 3 + 1;
        indices[i * 3 + 2] = -(i * 3 + 2 + 1);
      }
    }

    meshes.push({
      name: obj.name || `mesh_${meshes.length}`,
      positions,
      normals,
      indices,
    });
  });

  return buildFBXBinary(meshes, scale);
}

/**
 * Download an FBX file.
 */
export function downloadFBX(
  object: THREE.Object3D,
  options: FBXExportOptions = {},
): void {
  const data = exportToFBX(object, options);
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${options.filename || 'vina-export'}.fbx`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  FBX Binary Writer                                                 */
/* ------------------------------------------------------------------ */

/** Null record sentinel: 13 zero bytes for FBX 7400 */
const NULL_RECORD_SIZE = 13;

interface FBXProperty {
  type: string;         // 'S' | 'I' | 'L' | 'D' | 'i' | 'd'
  value: unknown;
}

interface FBXNode {
  name: string;
  properties: FBXProperty[];
  children: FBXNode[];
}

function node(name: string, properties: FBXProperty[] = [], children: FBXNode[] = []): FBXNode {
  return { name, properties, children };
}
function propS(v: string): FBXProperty { return { type: 'S', value: v }; }
function propI(v: number): FBXProperty { return { type: 'I', value: v }; }
function propL(v: bigint): FBXProperty { return { type: 'L', value: v }; }
function propD(v: number): FBXProperty { return { type: 'D', value: v }; }
function propDArr(v: Float64Array): FBXProperty { return { type: 'd', value: v }; }
function propIArr(v: Int32Array): FBXProperty { return { type: 'i', value: v }; }

class BinaryWriter {
  private buf: ArrayBuffer;
  private view: DataView;
  private u8: Uint8Array;
  private pos = 0;

  constructor(initialSize = 4096) {
    this.buf = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buf);
    this.u8 = new Uint8Array(this.buf);
  }

  private grow(needed: number) {
    while (this.pos + needed > this.buf.byteLength) {
      const newBuf = new ArrayBuffer(this.buf.byteLength * 2);
      new Uint8Array(newBuf).set(this.u8);
      this.buf = newBuf;
      this.view = new DataView(this.buf);
      this.u8 = new Uint8Array(this.buf);
    }
  }

  writeUint8(v: number) { this.grow(1); this.view.setUint8(this.pos, v); this.pos += 1; }
  writeUint32(v: number) { this.grow(4); this.view.setUint32(this.pos, v, true); this.pos += 4; }
  writeInt32(v: number) { this.grow(4); this.view.setInt32(this.pos, v, true); this.pos += 4; }
  writeFloat64(v: number) { this.grow(8); this.view.setFloat64(this.pos, v, true); this.pos += 8; }
  writeBigInt64(v: bigint) { this.grow(8); this.view.setBigInt64(this.pos, v, true); this.pos += 8; }

  writeBytes(data: Uint8Array) {
    this.grow(data.byteLength);
    this.u8.set(data, this.pos);
    this.pos += data.byteLength;
  }

  writeString(s: string) {
    for (let i = 0; i < s.length; i++) {
      this.writeUint8(s.charCodeAt(i));
    }
  }

  writeZeros(count: number) {
    this.grow(count);
    // ArrayBuffer is zero-initialized; just advance if fresh, otherwise fill
    this.u8.fill(0, this.pos, this.pos + count);
    this.pos += count;
  }

  getPosition(): number { return this.pos; }

  /** Patch a uint32 at a previous offset */
  patchUint32(offset: number, value: number) {
    this.view.setUint32(offset, value, true);
  }

  toArrayBuffer(): ArrayBuffer {
    return this.buf.slice(0, this.pos);
  }
}

/* ------------------------------------------------------------------ */
/*  Serialization                                                     */
/* ------------------------------------------------------------------ */

function writeProperty(w: BinaryWriter, prop: FBXProperty) {
  const { type, value } = prop;
  w.writeUint8(type.charCodeAt(0));

  switch (type) {
    case 'S': {
      const s = value as string;
      w.writeUint32(s.length);
      w.writeString(s);
      break;
    }
    case 'I':
      w.writeInt32(value as number);
      break;
    case 'L':
      w.writeBigInt64(value as bigint);
      break;
    case 'D':
      w.writeFloat64(value as number);
      break;
    case 'd': {
      const arr = value as Float64Array;
      w.writeUint32(arr.length);          // arrayLength (element count)
      w.writeUint32(0);                   // encoding (0 = raw)
      w.writeUint32(arr.byteLength);      // compressedLength (= raw length)
      w.writeBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
      break;
    }
    case 'i': {
      const arr = value as Int32Array;
      w.writeUint32(arr.length);
      w.writeUint32(0);
      w.writeUint32(arr.byteLength);
      w.writeBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
      break;
    }
  }
}

function writeNode(w: BinaryWriter, n: FBXNode) {
  // Record header: endOffset(4) + numProperties(4) + propListLen(4) + nameLen(1) + name
  const endOffsetPos = w.getPosition();
  w.writeUint32(0); // placeholder for endOffset
  w.writeUint32(n.properties.length);
  const propListLenPos = w.getPosition();
  w.writeUint32(0); // placeholder for propListLen
  w.writeUint8(n.name.length);
  w.writeString(n.name);

  // Properties
  const propStart = w.getPosition();
  for (const prop of n.properties) {
    writeProperty(w, prop);
  }
  const propLen = w.getPosition() - propStart;
  w.patchUint32(propListLenPos, propLen);

  // Nested children
  if (n.children.length > 0) {
    for (const child of n.children) {
      writeNode(w, child);
    }
    // Null record sentinel after children
    w.writeZeros(NULL_RECORD_SIZE);
  }

  // Patch endOffset
  w.patchUint32(endOffsetPos, w.getPosition());
}

/* ------------------------------------------------------------------ */
/*  Build FBX structure                                               */
/* ------------------------------------------------------------------ */

function buildP70(name: string, type: string, subType: string, flags: string, value: FBXProperty): FBXNode {
  return node('P', [propS(name), propS(type), propS(subType), propS(flags), value]);
}

function buildFBXBinary(
  meshes: Array<{
    name: string;
    positions: Float64Array;
    normals: Float64Array;
    indices: Int32Array;
  }>,
  unitScale: number,
): ArrayBuffer {
  const w = new BinaryWriter(meshes.length > 0 ? 65536 : 4096);

  // --- Header ---
  // "Kaydara FBX Binary  \0" (21 chars + \0) + \x1a\x00
  w.writeString('Kaydara FBX Binary  \0');
  w.writeUint8(0x1a);
  w.writeUint8(0x00);
  // Version: 7400
  w.writeUint32(7400);

  // --- FBXHeaderExtension ---
  writeNode(w, node('FBXHeaderExtension', [], [
    node('FBXHeaderVersion', [propI(1003)]),
    node('FBXVersion', [propI(7400)]),
    node('Creator', [propS('OpenClo')]),
  ]));

  // --- GlobalSettings ---
  writeNode(w, node('GlobalSettings', [], [
    node('Version', [propI(1000)]),
    node('Properties70', [], [
      buildP70('UpAxis', 'int', 'Integer', '', propI(1)),
      buildP70('FrontAxis', 'int', 'Integer', '', propI(2)),
      buildP70('UnitScaleFactor', 'double', 'Number', '', propD(unitScale === 1.0 ? 1.0 : unitScale)),
    ]),
  ]));

  // --- Objects ---
  const objectNodes: FBXNode[] = [];
  const connections: FBXNode[] = [];

  let idCounter = 1000000000n;
  for (const mesh of meshes) {
    const geoId = idCounter++;
    const modelId = idCounter++;

    // Geometry node
    const layerElementNormal = node('LayerElementNormal', [propI(0)], [
      node('Version', [propI(101)]),
      node('Name', [propS('')]),
      node('MappingInformationType', [propS('ByVertice')]),
      node('ReferenceInformationType', [propS('Direct')]),
      node('Normals', [propDArr(mesh.normals)]),
    ]);

    const layerElement = node('LayerElement', [], [
      node('Type', [propS('LayerElementNormal')]),
      node('TypedIndex', [propI(0)]),
    ]);

    const layer = node('Layer', [propI(0)], [
      node('Version', [propI(100)]),
      layerElement,
    ]);

    objectNodes.push(
      node('Geometry', [propL(geoId), propS(`Geometry::${mesh.name}`), propS('Mesh')], [
        node('Vertices', [propDArr(mesh.positions)]),
        node('PolygonVertexIndex', [propIArr(mesh.indices)]),
        layerElementNormal,
        layer,
      ]),
    );

    // Model node
    objectNodes.push(
      node('Model', [propL(modelId), propS(`Model::${mesh.name}`), propS('Mesh')], [
        node('Version', [propI(232)]),
      ]),
    );

    // Connections: geometry → model, model → root (0)
    connections.push(
      node('C', [propS('OO'), propL(geoId), propL(modelId)]),
    );
    connections.push(
      node('C', [propS('OO'), propL(modelId), propL(0n)]),
    );
  }

  writeNode(w, node('Objects', [], objectNodes));

  // --- Connections ---
  writeNode(w, node('Connections', [], connections));

  // --- Footer null record ---
  w.writeZeros(NULL_RECORD_SIZE);

  return w.toArrayBuffer();
}
