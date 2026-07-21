import React from "react";
import Svg, { Path, Rect, Circle, Defs, LinearGradient, Stop } from "react-native-svg";

interface PillAvatarProps {
  type: string;
  color: string;
  size?: number;
}

export default function PillAvatar({ type, color, size = 48 }: PillAvatarProps) {
  const normalizedType = type.toLowerCase().trim();
  const fillColor = color || "#3b82f6";

  const renderIcon = () => {
    switch (normalizedType) {
      case "capsule":
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Defs>
              <LinearGradient id="capsuleGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={fillColor} />
                <Stop offset="100%" stopColor={`${fillColor}b0`} />
              </LinearGradient>
            </Defs>
            <Path
              d="M6 3h12a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"
              fill="url(#capsuleGrad)"
              transform="rotate(45 12 12)"
            />
            <Path
              d="M6 3h6v10.5H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"
              fill="#ffffff"
              fillOpacity={0.25}
              transform="rotate(45 12 12)"
            />
          </Svg>
        );

      case "inhaler":
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Defs>
              <LinearGradient id="inhalerGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={fillColor} />
                <Stop offset="100%" stopColor={`${fillColor}80`} />
              </LinearGradient>
            </Defs>
            <Rect
              x={7}
              y={3}
              width={6}
              height={12}
              fill="url(#inhalerGrad)"
              rx={1.5}
            />
            <Rect
              x={13}
              y={11}
              width={6}
              height={4}
              fill={fillColor}
              rx={1}
            />
            <Circle cx={10} cy={6} r={2} fill="#ffffff" fillOpacity={0.6} />
          </Svg>
        );

      case "vial":
      case "injection":
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Defs>
              <LinearGradient id="vialGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={fillColor} />
                <Stop offset="100%" stopColor={`${fillColor}90`} />
              </LinearGradient>
            </Defs>
            {/* Top cap */}
            <Rect x={10} y={3} width={4} height={2} fill="#94a3b8" rx={0.5} />
            {/* Neck */}
            <Rect x={11} y={5} width={2} height={2} fill="#cbd5e1" />
            {/* Body */}
            <Path
              d="M8 7h8a1.5 1.5 0 0 1 1.5 1.5v9a3 3 0 0 1-3 3H9.5a3 3 0 0 1-3-3v-9A1.5 1.5 0 0 1 8 7Z"
              fill="url(#vialGrad)"
            />
            {/* Label */}
            <Rect x={9} y={10} width={6} height={5} fill="#ffffff" rx={0.5} />
            <Rect x={10} y={12} width={4} height={1} fill={fillColor} fillOpacity={0.6} />
          </Svg>
        );

      case "drops":
      case "drops/syrup":
      case "syrup":
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"
              fill={fillColor}
            />
            <Path
              d="M12 4.5l3.5 3.5a5 5 0 0 1-7 0z"
              fill="#ffffff"
              fillOpacity={0.3}
            />
          </Svg>
        );

      case "tablet":
      case "round":
      default:
        return (
          <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            <Defs>
              <LinearGradient id="tabletGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={fillColor} />
                <Stop offset="100%" stopColor={`${fillColor}a0`} />
              </LinearGradient>
            </Defs>
            <Circle cx={12} cy={12} r={9} fill="url(#tabletGrad)" />
            {/* Score line in middle of pill */}
            <Path d="M6 12h12" stroke="#ffffff" strokeWidth={1} strokeOpacity={0.4} />
          </Svg>
        );
    }
  };

  return renderIcon();
}
