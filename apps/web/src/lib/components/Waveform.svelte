<script lang="ts">
  /**
   * Particle Reactor — ZeroJarvis HUD (particle-based sci-fi design)
   * Uses scattered particles instead of line waves for a more futuristic feel
   */
  import { getState } from "$lib/stores/agent.svelte";

  let canvas: HTMLCanvasElement;
  let animFrame: number;
  let analyser: AnalyserNode | null = null;

  const SIZE = 520;
  const CENTER = SIZE / 2;

  // Particle system
  interface Particle {
    x: number;
    y: number;
    r: number;
    angle: number;
    speed: number;
    size: number;
    alpha: number;
    life: number;
    maxLife: number;
    color: "cyan" | "purple" | "white";
    layer: number;
  }

  let particles: Particle[] = [];

  export function setAnalyser(a: AnalyserNode) {
    analyser = a;
  }

  function createParticle(layer: number, state: string): Particle {
    const baseR = layer === 0 ? 25 + Math.random() * 35
                : layer === 1 ? 60 + Math.random() * 50
                : 110 + Math.random() * 55;
    const angle = Math.random() * Math.PI * 2;
    const speed = state === "thinking" ? (0.008 + Math.random() * 0.015)
                : state === "speaking" ? (0.005 + Math.random() * 0.02)
                : state === "listening" ? (0.004 + Math.random() * 0.01)
                : (0.002 + Math.random() * 0.005);
    const size = state === "speaking" ? (1 + Math.random() * 3)
               : (0.8 + Math.random() * 2);
    const colors: Array<"cyan" | "purple" | "white"> = ["cyan", "cyan", "purple", "white"];
    return {
      x: CENTER + Math.cos(angle) * baseR,
      y: CENTER + Math.sin(angle) * baseR,
      r: baseR,
      angle,
      speed: speed * (Math.random() > 0.5 ? 1 : -1),
      size,
      alpha: 0.3 + Math.random() * 0.7,
      life: 0,
      maxLife: 180 + Math.random() * 280,
      color: colors[Math.floor(Math.random() * colors.length)],
      layer,
    };
  }

  function getColor(color: string, alpha: number): string {
    switch (color) {
      case "cyan": return `rgba(0, 212, 255, ${alpha})`;
      case "purple": return `rgba(123, 97, 255, ${alpha})`;
      case "white": return `rgba(220, 230, 255, ${alpha * 0.6})`;
      default: return `rgba(0, 212, 255, ${alpha})`;
    }
  }

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = SIZE * window.devicePixelRatio;
    canvas.height = SIZE * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    let time = 0;
    particles = [];

    // Seed initial particles
    for (let i = 0; i < 80; i++) {
      const layer = i < 25 ? 0 : i < 55 ? 1 : 2;
      particles.push(createParticle(layer, "idle"));
    }

    function draw() {
      const state = getState();
      ctx.clearRect(0, 0, SIZE, SIZE);
      time += 0.012;

      drawReactorBase(ctx, time, state);
      updateAndDrawParticles(ctx, time, state);

      if (state === "camera") {
        drawCamera(ctx, time);
      }

      animFrame = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animFrame);
  });

  function updateAndDrawParticles(ctx: CanvasRenderingContext2D, t: number, state: string) {
    // Target particle count based on state
    const target = state === "speaking" ? 180
                 : state === "thinking" ? 140
                 : state === "listening" ? 120
                 : 80;

    // Spawn new particles if needed
    while (particles.length < target) {
      const layer = Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2;
      particles.push(createParticle(layer, state));
    }

    // Audio data for listening mode
    let audioData: Uint8Array | null = null;
    if (state === "listening" && analyser) {
      audioData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(audioData);
    }

    // Update & draw each particle
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life++;

      // Remove dead particles
      if (p.life > p.maxLife) {
        particles.splice(i, 1);
        continue;
      }

      // State-specific behavior
      if (state === "idle") {
        // Gentle orbit
        p.angle += p.speed;
        const breathe = Math.sin(t * 0.5 + p.angle * 2) * 3;
        p.x = CENTER + Math.cos(p.angle) * (p.r + breathe);
        p.y = CENTER + Math.sin(p.angle) * (p.r + breathe);
      } else if (state === "listening") {
        // Reactive expansion based on audio
        p.angle += p.speed * 1.5;
        const freqIdx = Math.floor(Math.abs(p.angle / (Math.PI * 2)) * (audioData?.length || 64)) % (audioData?.length || 64);
        const amp = audioData ? audioData[freqIdx] / 255 : Math.random() * 0.2;
        const expand = amp * 30;
        p.x = CENTER + Math.cos(p.angle) * (p.r + expand);
        p.y = CENTER + Math.sin(p.angle) * (p.r + expand);
        p.size = 0.8 + amp * 3;
      } else if (state === "thinking") {
        // Fast orbital with convergence
        p.angle += p.speed * 2.5;
        const converge = Math.sin(t * 2 + p.layer) * 10;
        p.x = CENTER + Math.cos(p.angle) * (p.r + converge);
        p.y = CENTER + Math.sin(p.angle) * (p.r + converge);
      } else if (state === "speaking") {
        // Coordinated orbital breathing — particles move in synchronized waves
        // Layer-based orbital speed for layered depth effect
        const layerSpeed = p.layer === 0 ? 1.8 : p.layer === 1 ? 1.2 : 0.8;
        p.angle += p.speed * layerSpeed;
        // Global breathing pulse — all particles expand/contract together
        const breath = Math.sin(t * 3) * 6;
        // Layered wave: inner ring faster, outer ring slower ripple
        const wave = Math.sin(t * 5 - p.r * 0.03) * (4 + p.layer);
        // Smooth radial offset
        const radialOffset = breath + wave;
        p.x = CENTER + Math.cos(p.angle) * (p.r + radialOffset);
        p.y = CENTER + Math.sin(p.angle) * (p.r + radialOffset);
        // Size pulses with speech rhythm
        p.size = (0.8 + p.layer * 0.3) + Math.sin(t * 4 + p.angle * 2) * 0.8;
      }

      // Draw particle
      const fadeIn = Math.min(1, p.life / 20);
      const fadeOut = Math.max(0, 1 - Math.max(0, p.life - p.maxLife + 40) / 40);
      const finalAlpha = p.alpha * fadeIn * fadeOut;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = getColor(p.color, finalAlpha);
      ctx.fill();

      // Glow effect for larger particles
      if (p.size > 1.5 && finalAlpha > 0.3) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = getColor(p.color, finalAlpha * 0.15);
        ctx.fill();
      }
    }

    // Draw connection lines between close particles (network/tech feel)
    if (state !== "idle") {
      ctx.lineWidth = 0.5;
      const len = particles.length;
      for (let i = 0; i < len; i++) {
        for (let j = i + 1; j < Math.min(len, i + 12); j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 45) {
            const lineAlpha = (1 - dist / 45) * 0.18;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${lineAlpha})`;
            ctx.stroke();
          }
        }
      }
    }

    // State-specific overlays
    if (state === "speaking") {
      // Smooth breathing rings that expand and fade in sync
      for (let i = 0; i < 4; i++) {
        const phase = (t * 1.2 + i * 1.6) % 5;
        const ringR = 35 + phase * 28;
        const alpha = Math.max(0, 0.25 - phase * 0.05);
        ctx.beginPath();
        ctx.arc(CENTER, CENTER, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = i % 2 === 0
          ? `rgba(0, 212, 255, ${alpha})`
          : `rgba(123, 97, 255, ${alpha * 0.7})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Rotating energy arcs (slower, elegant)
      for (let i = 0; i < 2; i++) {
        const r = 100 + i * 20;
        const startAngle = t * (0.8 + i * 0.3) + i * Math.PI;
        ctx.beginPath();
        ctx.arc(CENTER, CENTER, r, startAngle, startAngle + Math.PI * 0.4);
        ctx.strokeStyle = i === 0
          ? "rgba(0, 212, 255, 0.35)"
          : "rgba(123, 97, 255, 0.25)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }

    if (state === "thinking") {
      // Rotating energy arcs
      for (let i = 0; i < 3; i++) {
        const offset = (i * Math.PI * 2) / 3;
        const r = 70 + i * 20;
        const speed = 2 - i * 0.5;
        ctx.beginPath();
        ctx.arc(CENTER, CENTER, r, t * speed + offset, t * speed + offset + Math.PI * 0.3);
        ctx.strokeStyle = i === 0
          ? "rgba(0, 212, 255, 0.6)"
          : i === 1
            ? "rgba(123, 97, 255, 0.4)"
            : "rgba(0, 212, 255, 0.2)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }

    if (state === "listening") {
      // Pulsing inner ring
      const pulseR = 55 + Math.sin(t * 3) * 3;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, pulseR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 212, 255, ${0.15 + Math.sin(t * 4) * 0.08})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawReactorBase(ctx: CanvasRenderingContext2D, t: number, state: string) {
    // Outermost tech ring (dashed)
    ctx.setLineDash([12, 6]);
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 240, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.06)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    // Outer hexagonal frame
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const x = CENTER + Math.cos(angle) * 220;
      const y = CENTER + Math.sin(angle) * 220;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(0, 212, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Corner brackets
    const bracketR = 210;
    const bracketLen = 25;
    for (let i = 0; i < 4; i++) {
      const baseAngle = (i * Math.PI) / 2 + Math.PI / 4;
      const bx = CENTER + Math.cos(baseAngle) * bracketR;
      const by = CENTER + Math.sin(baseAngle) * bracketR;
      ctx.strokeStyle = "rgba(123, 97, 255, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(baseAngle + 0.3) * bracketLen, by + Math.sin(baseAngle + 0.3) * bracketLen);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + Math.cos(baseAngle - 0.3) * bracketLen, by + Math.sin(baseAngle - 0.3) * bracketLen);
      ctx.stroke();
    }

    // Second ring with tick marks
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 185, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.1)";
    ctx.lineWidth = 0.5;
    ctx.stroke();

    for (let i = 0; i < 120; i++) {
      const angle = (i / 120) * Math.PI * 2;
      const isMajor = i % 10 === 0;
      const isMid = i % 5 === 0;
      const len = isMajor ? 12 : isMid ? 7 : 3;
      const r1 = 186;
      const r2 = r1 + len;
      ctx.beginPath();
      ctx.moveTo(CENTER + Math.cos(angle) * r1, CENTER + Math.sin(angle) * r1);
      ctx.lineTo(CENTER + Math.cos(angle) * r2, CENTER + Math.sin(angle) * r2);
      ctx.strokeStyle = isMajor
        ? "rgba(123, 97, 255, 0.5)"
        : isMid
          ? "rgba(0, 212, 255, 0.2)"
          : "rgba(0, 212, 255, 0.08)";
      ctx.lineWidth = isMajor ? 1.5 : 0.5;
      ctx.stroke();
    }

    // Middle ring
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 155, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Rotating arc segments on middle ring
    for (let i = 0; i < 3; i++) {
      const segStart = t * 0.4 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, 155, segStart, segStart + 0.4);
      ctx.strokeStyle = "rgba(123, 97, 255, 0.3)";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Inner tech ring with ticks
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 130, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();

    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const len = i % 5 === 0 ? 10 : 4;
      const r1 = 120;
      const r2 = r1 + len;
      ctx.beginPath();
      ctx.moveTo(CENTER + Math.cos(angle) * r1, CENTER + Math.sin(angle) * r1);
      ctx.lineTo(CENTER + Math.cos(angle) * r2, CENTER + Math.sin(angle) * r2);
      ctx.strokeStyle = i % 5 === 0 ? "rgba(123, 97, 255, 0.4)" : "rgba(0, 212, 255, 0.12)";
      ctx.lineWidth = i % 5 === 0 ? 1.5 : 0.5;
      ctx.stroke();
    }

    // Core glow
    const glowI = state === "idle" ? 0.04 : 0.08;
    const gradient = ctx.createRadialGradient(CENTER, CENTER, 0, CENTER, CENTER, 100);
    gradient.addColorStop(0, `rgba(0, 212, 255, ${glowI + Math.sin(t * 2) * 0.02})`);
    gradient.addColorStop(0.5, `rgba(123, 97, 255, ${glowI * 0.2})`);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Center crosshair
    ctx.strokeStyle = "rgba(0, 212, 255, 0.2)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(CENTER - 15, CENTER);
    ctx.lineTo(CENTER - 5, CENTER);
    ctx.moveTo(CENTER + 5, CENTER);
    ctx.lineTo(CENTER + 15, CENTER);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER - 15);
    ctx.lineTo(CENTER, CENTER - 5);
    ctx.moveTo(CENTER, CENTER + 5);
    ctx.lineTo(CENTER, CENTER + 15);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 212, 255, ${0.6 + Math.sin(t * 3) * 0.2})`;
    ctx.fill();

    // Data readout decorations
    const readouts = [
      { angle: -0.3, r: 170, w: 30, h: 3 },
      { angle: 0.8, r: 175, w: 20, h: 3 },
      { angle: 2.2, r: 168, w: 25, h: 3 },
      { angle: 3.5, r: 172, w: 18, h: 3 },
    ];
    for (const rd of readouts) {
      const rx = CENTER + Math.cos(rd.angle) * rd.r;
      const ry = CENTER + Math.sin(rd.angle) * rd.r;
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(rd.angle);
      ctx.fillStyle = "rgba(0, 212, 255, 0.12)";
      ctx.fillRect(-rd.w / 2, -rd.h / 2, rd.w * (0.5 + Math.sin(t * 1.5 + rd.angle) * 0.5), rd.h);
      ctx.strokeStyle = "rgba(0, 212, 255, 0.08)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-rd.w / 2, -rd.h / 2, rd.w, rd.h);
      ctx.restore();
    }
  }

  function drawCamera(ctx: CanvasRenderingContext2D, t: number) {
    const r = 80 + Math.sin(t * 2) * 5;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232, 184, 48, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const scanAngle = t * 3;
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.lineTo(CENTER + Math.cos(scanAngle) * r, CENTER + Math.sin(scanAngle) * r);
    ctx.strokeStyle = "rgba(232, 184, 48, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, r, scanAngle - 0.3, scanAngle, false);
    ctx.closePath();
    ctx.fillStyle = "rgba(232, 184, 48, 0.06)";
    ctx.fill();

    const cr = 95;
    const cl = 15;
    ctx.strokeStyle = "rgba(232, 184, 48, 0.5)";
    ctx.lineWidth = 2;
    const corners = [
      { x: CENTER - cr * 0.7, y: CENTER - cr * 0.7, dx: 1, dy: 1 },
      { x: CENTER + cr * 0.7, y: CENTER - cr * 0.7, dx: -1, dy: 1 },
      { x: CENTER - cr * 0.7, y: CENTER + cr * 0.7, dx: 1, dy: -1 },
      { x: CENTER + cr * 0.7, y: CENTER + cr * 0.7, dx: -1, dy: -1 },
    ];
    for (const c of corners) {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y + c.dy * cl);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(c.x + c.dx * cl, c.y);
      ctx.stroke();
    }
  }
</script>

<div class="waveform-container">
  <canvas bind:this={canvas} style="width: {SIZE}px; height: {SIZE}px;"></canvas>
</div>

<style>
  .waveform-container {
    display: flex;
    justify-content: center;
    align-items: center;
    filter: drop-shadow(0 0 30px rgba(0, 212, 255, 0.1));
    width: 100%;
    max-width: 520px;
  }

  canvas {
    border-radius: 50%;
    width: 100% !important;
    height: auto !important;
    max-width: 520px;
    aspect-ratio: 1;
  }
</style>
