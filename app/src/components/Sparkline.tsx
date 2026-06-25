// Sparkline reutilizable (SVG). Línea + relleno degradado + punto final.
// El trazo se "dibuja" una vez al montar (anima strokeDashoffset), respetando
// la preferencia de reduce-motion. Pensado para series cortas (días/semanas).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

interface SparklineProps {
  /** Serie de valores (de más antiguo a más reciente). */
  data: number[];
  width: number;
  height: number;
  /** Color del trazo, el punto final y el degradado de relleno. */
  color: string;
  strokeWidth?: number;
  /** Anima el trazado al montar (default true). */
  animate?: boolean;
  /** Id único para el degradado (evita colisiones si hay varias sparklines). */
  gradientId?: string;
}

const PAD_X = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 6;
const DOT_R = 3;

export function Sparkline({
  data,
  width,
  height,
  color,
  strokeWidth = 2.5,
  animate = true,
  gradientId = 'spark',
}: SparklineProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduceMotion(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const geom = useMemo(() => {
    const n = data.length;
    if (n < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const innerW = width - PAD_X * 2;
    const innerH = height - PAD_TOP - PAD_BOTTOM;

    const pts = data.map((v, i) => {
      const x = PAD_X + (i / (n - 1)) * innerW;
      // Serie plana → línea centrada verticalmente.
      const norm = max === min ? 0.5 : (v - min) / range;
      const y = PAD_TOP + (1 - norm) * innerH;
      return { x, y };
    });

    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const area = `${line} L${pts[n - 1].x.toFixed(2)},${height} L${pts[0].x.toFixed(2)},${height} Z`;

    let length = 0;
    for (let i = 1; i < pts.length; i++) {
      length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }

    return { line, area, length, last: pts[n - 1] };
  }, [data, width, height]);

  const dash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!geom) return;
    if (!animate || reduceMotion) {
      dash.setValue(0);
      return;
    }
    dash.setValue(geom.length);
    const anim = Animated.timing(dash, {
      toValue: 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [geom, animate, reduceMotion, dash]);

  if (!geom) return null;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={geom.area} fill={`url(#${gradientId})`} />
      <AnimatedPath
        d={geom.line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={geom.length}
        strokeDashoffset={dash}
      />
      <Circle cx={geom.last.x} cy={geom.last.y} r={DOT_R + 3} fill={color} fillOpacity={0.25} />
      <Circle cx={geom.last.x} cy={geom.last.y} r={DOT_R} fill={color} />
    </Svg>
  );
}
