/**
 * Tests for Seamly2D XML Parser.
 */
import { describe, it, expect } from 'vitest';
import { parseSeamlyXML } from '../seamlyParser';

const MINIMAL_SM2D = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <version>0.6.0</version>
  <unit>cm</unit>
  <draftBlock name="TestBlock">
    <calculation>
      <point id="1" name="A" type="single" x="0" y="0" />
      <point id="2" name="B" type="endLine" basePoint="1" angle="90" length="10" />
    </calculation>
  </draftBlock>
</pattern>`;

const WITH_SPLINE = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <unit>cm</unit>
  <draftBlock name="Block1">
    <calculation>
      <point id="1" name="A" type="single" x="0" y="0" />
      <point id="2" name="B" type="single" x="10" y="0" />
      <spline id="3" type="simpleInteractive" point1="1" point4="2" angle1="45" angle2="135" length1="5" length2="5" />
    </calculation>
  </draftBlock>
</pattern>`;

const WITH_PIECES = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <unit>cm</unit>
  <draftBlock name="Block1">
    <calculation>
      <point id="1" name="A" type="single" x="0" y="0" />
      <point id="2" name="B" type="single" x="10" y="0" />
      <point id="3" name="C" type="single" x="10" y="10" />
    </calculation>
    <modeling>
      <point id="101" idObject="1" type="modeling" />
      <point id="102" idObject="2" type="modeling" />
      <point id="103" idObject="3" type="modeling" />
    </modeling>
    <pieces>
      <piece id="1" name="TestPiece" seamAllowance="1" closed="1">
        <nodes>
          <node idObject="101" type="NodePoint" />
          <node idObject="102" type="NodePoint" />
          <node idObject="103" type="NodePoint" />
        </nodes>
      </piece>
    </pieces>
  </draftBlock>
</pattern>`;

describe('parseSeamlyXML', () => {
  it('parses minimal .sm2d pattern', () => {
    const result = parseSeamlyXML(MINIMAL_SM2D);

    expect(result.name).toBe('pattern');
    expect(result.unit).toBe('cm');
    expect(result.construction).toHaveLength(2);
    expect(result.construction[0]).toMatchObject({
      id: 1,
      name: 'A',
      type: 'single',
      x: 0,
      y: 0,
    });
    expect(result.construction[1]).toMatchObject({
      id: 2,
      name: 'B',
      type: 'endLine',
      basePoint: 1,
      angle: 90,
      length: 10,
    });
  });

  it('parses spline elements', () => {
    const result = parseSeamlyXML(WITH_SPLINE);

    expect(result.construction).toHaveLength(3);
    const spline = result.construction[2];
    expect(spline.type).toBe('spline');
    expect(spline.point1).toBe(1);
    expect(spline.point4).toBe(2);
  });

  it('parses pieces', () => {
    const result = parseSeamlyXML(WITH_PIECES);

    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].name).toBe('TestPiece');
    expect(result.pieces[0].nodes).toHaveLength(3);
  });

  it('throws on invalid XML', () => {
    expect(() => parseSeamlyXML('not xml at all {')).toThrow();
  });

  it('throws on missing pattern element', () => {
    expect(() => parseSeamlyXML('<?xml version="1.0"?><notpattern></notpattern>')).toThrow(/missing.*pattern/i);
  });
});
