
import * as React from 'react';
import type { ShapeType, ShapeColor } from '../types';
import { COLOR_MAP } from '../constants';

interface ShapeProps {
  type: ShapeType;
  color: ShapeColor;
  className?: string;
}

export const Shape: React.FC<ShapeProps> = ({ type, color, className = 'w-16 h-16' }) => {
  const colorClass = COLOR_MAP[color] || 'fill-gray-400';

  // For an equilateral triangle with side length 100, the height is (sqrt(3)/2)*100
  const TRI_HEIGHT = 86.60254037844386; // ~100 * sqrt(3)/2

  const renderShape = () => {
    switch (type) {
      // square body (fills the viewBox)
      case 'square':
        // ORIGINAL:
        // return <rect x="0" y="0" width="100" height="100" />;
        // Draw the main square and a centered door near the bottom
        // Door dimensions are relative to the 100x100 viewBox so they scale with the square
        const doorWidth = 28;
        const doorHeight = 36;
        const doorX = (100 - doorWidth) / 2; // center the door
        const doorY = 100 - doorHeight - 6; // small margin from bottom
        return (
          <g>
            <rect x="0" y="0" width="100" height="100" />
            {/* brown door */}
            <rect x={String(doorX)} y={String(doorY)} width={String(doorWidth)} height={String(doorHeight)} rx="3" fill="#8B5A2B" />
            {/* door knob */}
            <circle cx={String(doorX + doorWidth - 6)} cy={String(doorY + doorHeight / 2)} r="2.5" fill="#3b2f22" />
          </g>
        );
      // equilateral triangle roof
      case 'triangle':
      // Points: top center, bottom-right, bottom-left using TRI_HEIGHT
      // add a chimney body (brown rectangle) and a darker cap placed on the right side of the roof add animated smoke puffs
      return (
        <g>
          <polygon points={`50,0 100,${TRI_HEIGHT} 0,${TRI_HEIGHT}`} />
          {/* chimney body: positioned on the right slope, sized relative to the viewBox */}
          <rect x={70} y={TRI_HEIGHT * 0.25} width={10} height={TRI_HEIGHT * 0.35} rx={1} fill="#8B5A2B" />
          {/* chimney cap (darker) */}
          <rect x={68} y={TRI_HEIGHT * 0.2} width={14} height={6} rx={1} fill="#5B3A21" />
          {/* animated smoke puffs */}
          <g fill="#cfcfcf" opacity="0.95">
            {/* puff 1 - starts just above the chimney cap and rises higher */}
            <circle cx={76} cy={TRI_HEIGHT * 0.18} r="2.5">
              <animate attributeName="cy" values={`${TRI_HEIGHT * 0.18};${TRI_HEIGHT * 0.02}`} dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="r" values="2.5;6" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.95;0" dur="1.8s" repeatCount="indefinite" />
            </circle>
            {/* puff 2 (delayed) - slightly to the right */}
            <circle cx={80} cy={TRI_HEIGHT * 0.2} r="2">
              <animate attributeName="cy" values={`${TRI_HEIGHT * 0.2};${TRI_HEIGHT * 0.04}`} dur="1.8s" begin="0.45s" repeatCount="indefinite" />
              <animate attributeName="r" values="2;5" dur="1.8s" begin="0.45s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.9;0" dur="1.8s" begin="0.45s" repeatCount="indefinite" />
            </circle>
            {/* puff 3 (more delayed) - slightly to the left */}
            <circle cx={72} cy={TRI_HEIGHT * 0.19} r="1.8">
              <animate attributeName="cy" values={`${TRI_HEIGHT * 0.19};${TRI_HEIGHT * 0.03}`} dur="1.8s" begin="0.9s" repeatCount="indefinite" />
              <animate attributeName="r" values="1.8;4.5" dur="1.8s" begin="0.9s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.85;0" dur="1.8s" begin="0.9s" repeatCount="indefinite" />
            </circle>
          </g>
        </g>
      );

        // ORIGINAL:
        // return (
        //   <polygon points={`50,0 100,${TRI_HEIGHT} 0,${TRI_HEIGHT}`} />
        // );
      default:
        return null;
    }
  };

  // Use a triangle-specific viewBox and preserveAspectRatio so the triangle remains equilateral
  const viewBox = type === 'triangle' ? `0 0 100 ${TRI_HEIGHT}` : '0 0 100 100';
  // Align triangle base to the bottom of the viewBox so its base will sit flush with the
  // top of the body when both are given the same width and centered.
  const preserve = type === 'triangle' ? 'xMidYMax meet' : 'none';

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio={preserve}
      role="img"
      aria-hidden="true"
      className={`${className} ${colorClass} drop-shadow-md`}
    >
      {renderShape()}
    </svg>
  );
};
