export enum AngleType {
  ByLength = 0,
  ByPointsIntersection,
  ByFirstEdgeSymmetry,
  BySecondEdgeSymmetry,
  ByFirstEdgeRightAngle,
  BySecondEdgeRightAngle,
}

export interface SAPoint {
  x: number;
  y: number;
  saBefore: number;   // -1 = use global width
  saAfter: number;     // -1 = use global width
  angleType: AngleType;
}

export interface SeamAllowanceOptions {
  width: number;
  closePath?: boolean;
}
