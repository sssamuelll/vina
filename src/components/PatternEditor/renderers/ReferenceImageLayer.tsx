import type { ReferenceImage } from '../../../types/types';

interface ReferenceImageLayerProps {
  referenceImages: ReferenceImage[];
  showReferenceImages: boolean;
  selectedReferenceImageId: string | null;
  objectUrlMap: Map<string, string>;  // imageId → blob URL
}

export default function ReferenceImageLayer({
  referenceImages,
  showReferenceImages,
  selectedReferenceImageId,
  objectUrlMap,
}: ReferenceImageLayerProps) {
  if (!showReferenceImages) return null;

  return (
    <>
      {referenceImages.filter(img => img.visible).map(img => {
        const url = objectUrlMap.get(img.id);
        const pxPerMm = img.pixelsPerMm ?? 1;
        const w = img.width / pxPerMm;
        const h = img.height / pxPerMm;
        const cx = img.position.x + w / 2;
        const cy = img.position.y + h / 2;

        if (!url) {
          // Missing image placeholder
          return (
            <g key={img.id}>
              <rect
                x={img.position.x} y={img.position.y}
                width={w} height={h}
                fill="none" stroke="#666" strokeWidth={1}
                strokeDasharray="4 4" opacity={0.5}
              />
              <text
                x={img.position.x + w / 2} y={img.position.y + h / 2}
                textAnchor="middle" dominantBaseline="central"
                fill="#666" fontSize={12}
              >
                Missing: {img.filename}
              </text>
            </g>
          );
        }

        return (
          <g key={img.id}>
            <image
              href={url}
              x={img.position.x}
              y={img.position.y}
              width={w}
              height={h}
              opacity={img.opacity}
              transform={`rotate(${img.rotation}, ${cx}, ${cy})`}
              style={{ pointerEvents: img.locked ? 'none' : 'auto' }}
            />
            {selectedReferenceImageId === img.id && (
              <rect
                x={img.position.x} y={img.position.y}
                width={w} height={h}
                fill="none" stroke="#4a9eff" strokeWidth={2}
                strokeDasharray="6 3"
                transform={`rotate(${img.rotation}, ${cx}, ${cy})`}
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        );
      })}
    </>
  );
}
