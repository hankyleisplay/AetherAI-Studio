import React, { useEffect, useRef } from 'react';
import { AgentState } from '../types';

interface LiquidBackgroundProps {
  state: AgentState;
}

interface Orb {
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  vx: number;
  vy: number;
  speedMultiplier: number;
  angle: number;
  angleSpeed: number;
  colors: [string, string];
}

interface Particle {
  x: number;
  y: number;
  radius: number;
  vy: number;
  vx: number;
  alpha: number;
  baseAlpha: number;
  pulseSpeed: number;
  phase: number;
}

export const LiquidBackground: React.FC<LiquidBackgroundProps> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, active: false });

  // Palette definitions for states (Optical Liquid Gradient Palette)
  const getPalette = (st: AgentState): [string, string][] => {
    switch (st) {
      case 'thinking':
        return [
          ['rgba(168, 85, 247, 0.45)', 'rgba(217, 70, 239, 0.2)'],   // Purple / Fuchsia
          ['rgba(236, 72, 153, 0.40)', 'rgba(147, 51, 234, 0.25)'],  // Pink / Deep Violet
          ['rgba(99, 102, 241, 0.35)', 'rgba(192, 132, 252, 0.2)'],  // Indigo / Lavender
          ['rgba(244, 63, 94, 0.35)', 'rgba(139, 92, 246, 0.15)'],   // Rose / Violet
        ];
      case 'calling_tool':
        return [
          ['rgba(16, 185, 129, 0.45)', 'rgba(5, 150, 105, 0.2)'],   // Emerald
          ['rgba(6, 182, 212, 0.40)', 'rgba(20, 184, 166, 0.25)'],   // Cyan / Teal
          ['rgba(52, 211, 153, 0.35)', 'rgba(14, 165, 233, 0.2)'],   // Mint / Sky
          ['rgba(16, 185, 129, 0.30)', 'rgba(59, 130, 246, 0.15)'],  // Green / Blue
        ];
      case 'generating':
        return [
          ['rgba(0, 242, 254, 0.50)', 'rgba(79, 172, 254, 0.25)'],   // Electric Cyan
          ['rgba(14, 165, 233, 0.45)', 'rgba(99, 102, 241, 0.2)'],   // Sky / Indigo
          ['rgba(56, 189, 248, 0.40)', 'rgba(0, 242, 254, 0.15)'],   // Light Sky
          ['rgba(37, 99, 235, 0.35)', 'rgba(6, 182, 212, 0.2)'],     // Royal Blue
        ];
      case 'error':
        return [
          ['rgba(239, 68, 68, 0.45)', 'rgba(220, 38, 38, 0.2)'],     // Red
          ['rgba(249, 115, 22, 0.40)', 'rgba(234, 88, 12, 0.2)'],    // Orange
          ['rgba(244, 63, 94, 0.35)', 'rgba(185, 28, 28, 0.15)'],    // Rose
          ['rgba(245, 158, 11, 0.30)', 'rgba(225, 29, 72, 0.15)'],   // Amber
        ];
      case 'idle':
      default:
        return [
          ['rgba(0, 242, 254, 0.38)', 'rgba(59, 130, 246, 0.20)'],   // Cyan to Blue
          ['rgba(99, 102, 241, 0.32)', 'rgba(139, 92, 246, 0.18)'],  // Indigo to Violet
          ['rgba(14, 165, 233, 0.30)', 'rgba(0, 242, 254, 0.15)'],   // Sky Blue
          ['rgba(79, 70, 229, 0.25)', 'rgba(6, 182, 212, 0.12)'],    // Deep Indigo / Cyan
        ];
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Initial mouse center
    mouseRef.current.x = width / 2;
    mouseRef.current.y = height / 2;
    mouseRef.current.targetX = width / 2;
    mouseRef.current.targetY = height / 2;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
      mouseRef.current.active = true;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    // 1. Create Organic Liquid Orbs
    const palette = getPalette(state);
    const orbs: Orb[] = [
      {
        x: width * 0.25,
        y: height * 0.3,
        baseRadius: Math.min(width, height) * 0.35,
        radius: Math.min(width, height) * 0.35,
        vx: 0.6,
        vy: 0.4,
        speedMultiplier: 0.8,
        angle: 0,
        angleSpeed: 0.008,
        colors: palette[0]
      },
      {
        x: width * 0.75,
        y: height * 0.7,
        baseRadius: Math.min(width, height) * 0.38,
        radius: Math.min(width, height) * 0.38,
        vx: -0.5,
        vy: -0.6,
        speedMultiplier: 0.7,
        angle: Math.PI / 3,
        angleSpeed: 0.006,
        colors: palette[1]
      },
      {
        x: width * 0.5,
        y: height * 0.5,
        baseRadius: Math.min(width, height) * 0.28,
        radius: Math.min(width, height) * 0.28,
        vx: 0.4,
        vy: -0.5,
        speedMultiplier: 0.9,
        angle: Math.PI / 1.5,
        angleSpeed: 0.01,
        colors: palette[2]
      },
      {
        x: width * 0.8,
        y: height * 0.2,
        baseRadius: Math.min(width, height) * 0.3,
        radius: Math.min(width, height) * 0.3,
        vx: -0.4,
        vy: 0.5,
        speedMultiplier: 0.75,
        angle: Math.PI,
        angleSpeed: 0.007,
        colors: palette[3]
      }
    ];

    // 2. Create Floating Luminescence Micro-Particles (Spatial Depth)
    const particleCount = 28;
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 2 + 1,
      vy: -(Math.random() * 0.3 + 0.15),
      vx: (Math.random() - 0.5) * 0.2,
      alpha: Math.random() * 0.4 + 0.1,
      baseAlpha: Math.random() * 0.4 + 0.1,
      pulseSpeed: Math.random() * 0.02 + 0.01,
      phase: Math.random() * Math.PI * 2
    }));

    let time = 0;

    // Render Loop
    const render = () => {
      time += 0.015;

      // Mouse Lerp
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      // Clear with dark high-tech canvas baseline
      ctx.fillStyle = '#070a13';
      ctx.fillRect(0, 0, width, height);

      // Use Screen Composite for luminous glass optics
      ctx.globalCompositeOperation = 'screen';

      // Draw and Update Fluid Orbs
      orbs.forEach((orb) => {
        orb.angle += orb.angleSpeed;
        
        // Complex fluid floating motion
        orb.x += Math.sin(orb.angle) * orb.speedMultiplier * 1.5 + orb.vx;
        orb.y += Math.cos(orb.angle * 0.8) * orb.speedMultiplier * 1.5 + orb.vy;

        // Bounce gently inside viewport boundaries
        const padding = orb.radius * 0.4;
        if (orb.x < -padding) { orb.x = -padding; orb.vx = Math.abs(orb.vx); }
        if (orb.x > width + padding) { orb.x = width + padding; orb.vx = -Math.abs(orb.vx); }
        if (orb.y < -padding) { orb.y = -padding; orb.vy = Math.abs(orb.vy); }
        if (orb.y > height + padding) { orb.y = height + padding; orb.vy = -Math.abs(orb.vy); }

        // Breathing pulsation
        orb.radius = orb.baseRadius + Math.sin(time * 1.5 + orb.angle) * (orb.baseRadius * 0.15);

        // Draw radial chromatic glow
        const grad = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, Math.max(orb.radius, 10)
        );
        grad.addColorStop(0, orb.colors[0]);
        grad.addColorStop(0.55, orb.colors[1]);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, Math.max(orb.radius, 10), 0, Math.PI * 2);
        ctx.fill();
      });

      // Mouse interactive dynamic caustic glow
      if (mouseRef.current.active) {
        const mouseGrad = ctx.createRadialGradient(
          mouseRef.current.x, mouseRef.current.y, 0,
          mouseRef.current.x, mouseRef.current.y, 320
        );
        mouseGrad.addColorStop(0, 'rgba(0, 242, 254, 0.18)');
        mouseGrad.addColorStop(0.4, 'rgba(99, 102, 241, 0.08)');
        mouseGrad.addColorStop(1, 'transparent');

        ctx.fillStyle = mouseGrad;
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, 320, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Floating Micro-Luminescences
      particles.forEach((p) => {
        p.y += p.vy;
        p.x += p.vx + Math.sin(time + p.phase) * 0.3;
        p.phase += p.pulseSpeed;
        p.alpha = p.baseAlpha + Math.sin(p.phase) * (p.baseAlpha * 0.5);

        if (p.y < 0) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }

        ctx.fillStyle = `rgba(165, 243, 252, ${Math.max(p.alpha, 0.05)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Restore Normal Composite for vignette & depth overlay
      ctx.globalCompositeOperation = 'source-over';

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [state]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* 60fps Liquid Fluid Aurora Canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full block" 
      />

      {/* Cybernetic Mesh Grid Subtle Texture */}
      <div 
        className="absolute inset-0 opacity-[0.035] pointer-events-none" 
        style={{ 
          backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1px)`,
          backgroundSize: '32px 32px' 
        }} 
      />

      {/* Soft Vignette Overlay for Depth Focus */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#070a13]/30 via-transparent to-[#070a13]/70 pointer-events-none" />
    </div>
  );
};
