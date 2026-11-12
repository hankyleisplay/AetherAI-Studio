import React, { useEffect, useRef } from 'react';
import { AgentState } from '../types';

interface LiquidBackgroundProps {
  state: AgentState;
  isEcoMode?: boolean;
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

// The same aurora as the launcher (launcher/ui/style.css .blob-*): cyan, violet, pink and emerald light over deep
// navy. The colours shift with what the agent is doing.
const PALETTES: Record<string, [string, string][]> = {
  idle: [
    ['rgba(32, 212, 255, 0.42)', 'rgba(32, 212, 255, 0.14)'],
    ['rgba(139, 92, 246, 0.44)', 'rgba(139, 92, 246, 0.15)'],
    ['rgba(255, 95, 168, 0.30)', 'rgba(255, 95, 168, 0.10)'],
    ['rgba(45, 212, 168, 0.28)', 'rgba(45, 212, 168, 0.09)'],
  ],
  thinking: [
    ['rgba(168, 85, 247, 0.48)', 'rgba(168, 85, 247, 0.16)'],
    ['rgba(236, 72, 153, 0.38)', 'rgba(236, 72, 153, 0.13)'],
    ['rgba(99, 102, 241, 0.40)', 'rgba(99, 102, 241, 0.14)'],
    ['rgba(32, 212, 255, 0.24)', 'rgba(32, 212, 255, 0.08)'],
  ],
  calling_tool: [
    ['rgba(45, 212, 168, 0.44)', 'rgba(45, 212, 168, 0.15)'],
    ['rgba(32, 212, 255, 0.40)', 'rgba(32, 212, 255, 0.14)'],
    ['rgba(52, 211, 153, 0.32)', 'rgba(52, 211, 153, 0.10)'],
    ['rgba(79, 156, 255, 0.30)', 'rgba(79, 156, 255, 0.10)'],
  ],
  generating: [
    ['rgba(32, 212, 255, 0.48)', 'rgba(32, 212, 255, 0.16)'],
    ['rgba(79, 156, 255, 0.42)', 'rgba(79, 156, 255, 0.14)'],
    ['rgba(139, 92, 246, 0.34)', 'rgba(139, 92, 246, 0.11)'],
    ['rgba(45, 212, 168, 0.26)', 'rgba(45, 212, 168, 0.08)'],
  ],
  error: [
    ['rgba(251, 113, 133, 0.44)', 'rgba(251, 113, 133, 0.15)'],
    ['rgba(249, 115, 22, 0.34)', 'rgba(249, 115, 22, 0.11)'],
    ['rgba(139, 92, 246, 0.30)', 'rgba(139, 92, 246, 0.10)'],
    ['rgba(251, 191, 36, 0.24)', 'rgba(251, 191, 36, 0.08)'],
  ],
};

const paletteFor = (state: AgentState): [string, string][] => PALETTES[state] || PALETTES.idle;

export const LiquidBackground: React.FC<LiquidBackgroundProps> = ({ state, isEcoMode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const isStatic = Boolean(isEcoMode) || reducedMotion;
    // The canvas only holds soft gradients, so rendering it at device resolution would just cost fill rate
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Deep navy base with a lighter glow at the top, as in the launcher
    let base: { linear: CanvasGradient; top: CanvasGradient } | null = null;
    const buildBase = () => {
      const linear = ctx.createLinearGradient(0, 0, 0, height);
      linear.addColorStop(0, '#0a1030');
      linear.addColorStop(0.55, '#0b0a24');
      linear.addColorStop(1, '#09091c');
      const top = ctx.createRadialGradient(width * 0.5, 0, 0, width * 0.5, 0, Math.max(width, height) * 0.75);
      top.addColorStop(0, 'rgba(40, 70, 170, 0.50)');
      top.addColorStop(1, 'rgba(40, 70, 170, 0)');
      base = { linear, top };
    };
    buildBase();

    const palette = paletteFor(state);
    const minSide = () => Math.min(width, height);
    const makeOrbs = (): Orb[] => [
      { x: width * 0.12, y: height * 0.12, base: 0.46, vx: 0.5, vy: 0.35, speed: 0.8, angle: 0, angleSpeed: 0.006 },
      { x: width * 0.88, y: height * 0.32, base: 0.5, vx: -0.45, vy: 0.4, speed: 0.7, angle: Math.PI / 3, angleSpeed: 0.005 },
      { x: width * 0.3, y: height * 0.95, base: 0.42, vx: 0.4, vy: -0.45, speed: 0.85, angle: Math.PI / 1.5, angleSpeed: 0.007 },
      { x: width * 0.78, y: height * 0.85, base: 0.36, vx: -0.35, vy: -0.4, speed: 0.75, angle: Math.PI, angleSpeed: 0.006 },
    ].map((o, i) => ({
      x: o.x,
      y: o.y,
      baseRadius: minSide() * o.base,
      radius: minSide() * o.base,
      vx: o.vx,
      vy: o.vy,
      speedMultiplier: o.speed,
      angle: o.angle,
      angleSpeed: o.angleSpeed,
      colors: palette[i],
    }));
    let orbs = makeOrbs();

    const particles: Particle[] = isStatic ? [] : Array.from({ length: 22 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.6 + 0.8,
      vy: -(Math.random() * 0.3 + 0.15),
      vx: (Math.random() - 0.5) * 0.2,
      alpha: Math.random() * 0.35 + 0.1,
      baseAlpha: Math.random() * 0.35 + 0.1,
      pulseSpeed: Math.random() * 0.02 + 0.01,
      phase: Math.random() * Math.PI * 2,
    }));

    const paintBase = () => {
      if (!base) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = base.linear;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = base.top;
      ctx.fillRect(0, 0, width, height);
    };

    const paintOrb = (orb: Orb) => {
      const r = Math.max(orb.radius, 10);
      const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, r);
      grad.addColorStop(0, orb.colors[0]);
      grad.addColorStop(0.55, orb.colors[1]);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    // Eco mode / reduced motion: one still frame of the same aurora (glass needs colour behind it to read as glass)
    const paintStatic = () => {
      paintBase();
      ctx.globalCompositeOperation = 'screen';
      orbs.forEach(paintOrb);
      ctx.globalCompositeOperation = 'source-over';
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      buildBase();
      if (isStatic) {
        orbs = makeOrbs();
        paintStatic();
      } else {
        orbs.forEach((o, i) => {
          const share = [0.46, 0.5, 0.42, 0.36][i];
          o.baseRadius = minSide() * share;
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
      mouseRef.current.active = true;
    };

    window.addEventListener('resize', handleResize);

    if (isStatic) {
      paintStatic();
      return () => window.removeEventListener('resize', handleResize);
    }

    window.addEventListener('mousemove', handleMouseMove);
    mouseRef.current.x = mouseRef.current.targetX = width / 2;
    mouseRef.current.y = mouseRef.current.targetY = height / 2;

    let animId = 0;
    let time = 0;
    // While the model is busy, cap the canvas to ~24fps so local inference (Ollama / LM Studio)
    // does not have to share the GPU with a 60fps animation; skip frames entirely when hidden.
    const isBusy = state === 'generating' || state === 'thinking' || state === 'calling_tool';
    const frameBudget = isBusy ? 1000 / 24 : 1000 / 60;
    let lastFrame = 0;

    const render = (now: number = performance.now()) => {
      animId = requestAnimationFrame(render);
      if (document.hidden || now - lastFrame < frameBudget) return;
      const frameScale = lastFrame ? Math.min(3, (now - lastFrame) / (1000 / 60)) : 1;
      lastFrame = now;
      time += 0.015 * frameScale;

      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.05;

      paintBase();
      ctx.globalCompositeOperation = 'screen';

      orbs.forEach((orb) => {
        orb.angle += orb.angleSpeed * frameScale;
        orb.x += (Math.sin(orb.angle) * orb.speedMultiplier * 1.2 + orb.vx) * frameScale;
        orb.y += (Math.cos(orb.angle * 0.8) * orb.speedMultiplier * 1.2 + orb.vy) * frameScale;

        // Bounce gently inside viewport boundaries
        const padding = orb.radius * 0.4;
        if (orb.x < -padding) { orb.x = -padding; orb.vx = Math.abs(orb.vx); }
        if (orb.x > width + padding) { orb.x = width + padding; orb.vx = -Math.abs(orb.vx); }
        if (orb.y < -padding) { orb.y = -padding; orb.vy = Math.abs(orb.vy); }
        if (orb.y > height + padding) { orb.y = height + padding; orb.vy = -Math.abs(orb.vy); }

        orb.radius = orb.baseRadius + Math.sin(time * 1.5 + orb.angle) * (orb.baseRadius * 0.12);
        paintOrb(orb);
      });

      // Soft light that follows the pointer
      if (mouseRef.current.active) {
        const { x, y } = mouseRef.current;
        const mouseGrad = ctx.createRadialGradient(x, y, 0, x, y, 320);
        mouseGrad.addColorStop(0, 'rgba(94, 231, 255, 0.14)');
        mouseGrad.addColorStop(0.4, 'rgba(139, 92, 246, 0.06)');
        mouseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = mouseGrad;
        ctx.beginPath();
        ctx.arc(x, y, 320, 0, Math.PI * 2);
        ctx.fill();
      }

      particles.forEach((p) => {
        p.y += p.vy * frameScale;
        p.x += (p.vx + Math.sin(time + p.phase) * 0.3) * frameScale;
        p.phase += p.pulseSpeed * frameScale;
        p.alpha = p.baseAlpha + Math.sin(p.phase) * (p.baseAlpha * 0.5);
        if (p.y < 0) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        ctx.fillStyle = `rgba(200, 245, 255, ${Math.max(p.alpha, 0.05)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalCompositeOperation = 'source-over';
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [state, isEcoMode]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none" aria-hidden="true">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      {/* Slight vignette so text near the edges keeps its contrast */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgba(5,6,22,0.55))] pointer-events-none" />
    </div>
  );
};
