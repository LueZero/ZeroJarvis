<script lang="ts">
  /**
   * Arc Reactor Waveform — ZeroJarvis HUD (cyan/purple tech style)
   * Speaking mode features vibrating lines for voice output visualization
   */
  import { getState } from "$lib/stores/agent.svelte";

  let canvas: HTMLCanvasElement;
  let animFrame: number;
  let analyser: AnalyserNode | null = null;

  const SIZE = 520;
  const CENTER = SIZE / 2;

  export function setAnalyser(a: AnalyserNode) {
    analyser = a;
  }

  $effect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = SIZE * window.devicePixelRatio;
    canvas.height = SIZE * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    let time = 0;

    function draw() {
      const state = getState();
      ctx.clearRect(0, 0, SIZE, SIZE);
      time += 0.012;

      drawReactorBase(ctx, time, state);

      if (state === "idle") {
        drawIdle(ctx, time);
      } else if (state === "listening") {
        drawListening(ctx, time);
      } else if (state === "thinking") {
        drawThinking(ctx, time);
      } else if (state === "speaking") {
        drawSpeaking(ctx, time);
      } else if (state === "camera") {
        drawCamera(ctx, time);
      }

      animFrame = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animFrame);
  });

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

  function drawIdle(ctx: CanvasRenderingContext2D, t: number) {
    // === Ambient wave rings — gentle undulating lines ===
    for (let ring = 0; ring < 3; ring++) {
      const baseR = 70 + ring * 20;
      const segments = 100;
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        // Gentle organic wave motion
        const wave = Math.sin(t * 0.8 + angle * 3 + ring * 1.2) * (2 + ring)
          + Math.sin(t * 0.5 + angle * 5 - ring * 0.8) * 1.5;
        const r = baseR + wave;
        const x = CENTER + Math.cos(angle) * r;
        const y = CENTER + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const alpha = 0.2 - ring * 0.04;
      ctx.strokeStyle = ring === 0
        ? `rgba(0, 212, 255, ${alpha})`
        : ring === 1
          ? `rgba(123, 97, 255, ${alpha * 0.8})`
          : `rgba(0, 212, 255, ${alpha * 0.6})`;
      ctx.lineWidth = 1.5 - ring * 0.3;
      ctx.stroke();
    }

    // Breathing inner glow
    const breathe = 0.06 + Math.sin(t * 0.6) * 0.03;
    const idleGrad = ctx.createRadialGradient(CENTER, CENTER, 0, CENTER, CENTER, 90);
    idleGrad.addColorStop(0, `rgba(0, 212, 255, ${breathe})`);
    idleGrad.addColorStop(0.5, `rgba(123, 97, 255, ${breathe * 0.3})`);
    idleGrad.addColorStop(1, "transparent");
    ctx.fillStyle = idleGrad;
    ctx.fillRect(CENTER - 90, CENTER - 90, 180, 180);

    // Outer breathing ring
    const outerR = 105 + Math.sin(t * 0.7) * 3;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Slow rotating purple arc
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 92, t * 0.35, t * 0.35 + Math.PI * 0.3);
    ctx.strokeStyle = "rgba(123, 97, 255, 0.3)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();

    // Counter-rotating cyan arc
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 92, -t * 0.25 + Math.PI, -t * 0.25 + Math.PI + Math.PI * 0.2);
    ctx.strokeStyle = "rgba(0, 212, 255, 0.18)";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.stroke();

    // Floating ambient particles
    for (let i = 0; i < 6; i++) {
      const pAngle = t * 0.2 + (i * Math.PI * 2) / 6;
      const pR = 55 + Math.sin(t * 0.4 + i * 1.5) * 15;
      const size = 1.2 + Math.sin(t * 0.8 + i * 2) * 0.5;
      const alpha = 0.25 + Math.sin(t * 0.6 + i) * 0.15;
      ctx.beginPath();
      ctx.arc(
        CENTER + Math.cos(pAngle) * pR,
        CENTER + Math.sin(pAngle) * pR,
        size, 0, Math.PI * 2
      );
      ctx.fillStyle = i % 2 === 0
        ? `rgba(0, 212, 255, ${alpha})`
        : `rgba(123, 97, 255, ${alpha})`;
      ctx.fill();
    }
  }

  function drawListening(ctx: CanvasRenderingContext2D, t: number) {
    const bars = 90;
    const data = new Uint8Array(bars);
    analyser?.getByteFrequencyData(data);

    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2;
      const val = data[i] ? data[i] / 255 : Math.random() * 0.15;
      const r1 = 70;
      const r2 = r1 + val * 55;

      ctx.beginPath();
      ctx.moveTo(CENTER + Math.cos(angle) * r1, CENTER + Math.sin(angle) * r1);
      ctx.lineTo(CENTER + Math.cos(angle) * r2, CENTER + Math.sin(angle) * r2);
      ctx.strokeStyle = val > 0.5
        ? `rgba(123, 97, 255, ${0.5 + val * 0.5})`
        : `rgba(0, 212, 255, ${0.3 + val * 0.7})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Active pulse ring
    const pulseR = 110 + Math.sin(t * 3) * 3;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 212, 255, ${0.2 + Math.sin(t * 4) * 0.1})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Breathing inner glow
    const listenGrad = ctx.createRadialGradient(CENTER, CENTER, 0, CENTER, CENTER, 80);
    listenGrad.addColorStop(0, `rgba(0, 212, 255, ${0.1 + Math.sin(t * 2.5) * 0.04})`);
    listenGrad.addColorStop(1, "transparent");
    ctx.fillStyle = listenGrad;
    ctx.fillRect(CENTER - 80, CENTER - 80, 160, 160);
  }

  function drawThinking(ctx: CanvasRenderingContext2D, t: number) {
    // Triple rotating arcs
    for (let i = 0; i < 3; i++) {
      const offset = (i * Math.PI * 2) / 3;
      const r = 75 + i * 15;
      const speed = 1.8 - i * 0.4;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, r, t * speed + offset, t * speed + offset + Math.PI * 0.45);
      ctx.strokeStyle = i === 0
        ? "rgba(0, 212, 255, 0.8)"
        : i === 1
          ? "rgba(123, 97, 255, 0.5)"
          : "rgba(0, 212, 255, 0.25)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Orbiting dots
    for (let i = 0; i < 8; i++) {
      const angle = t * 2 + (i * Math.PI * 2) / 8;
      const r = 95;
      const size = 1.5 + Math.sin(t * 3 + i) * 0.5;
      ctx.beginPath();
      ctx.arc(CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r, size, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 212, 255, 0.6)";
      ctx.fill();
    }
  }

  function drawSpeaking(ctx: CanvasRenderingContext2D, t: number) {
    // === Core pulse glow ===
    const coreGrad = ctx.createRadialGradient(CENTER, CENTER, 0, CENTER, CENTER, 120);
    coreGrad.addColorStop(0, `rgba(0, 212, 255, ${0.2 + Math.sin(t * 5) * 0.08})`);
    coreGrad.addColorStop(0.4, `rgba(123, 97, 255, 0.06)`);
    coreGrad.addColorStop(1, "transparent");
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // === VIBRATING LINES — key speaking visualization ===
    // Multiple concentric wavy rings that vibrate rapidly
    for (let ring = 0; ring < 5; ring++) {
      const baseR = 55 + ring * 18;
      const segments = 120;
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        // Vibration: random-like rapid oscillation
        const vibration = Math.sin(t * 12 + i * 0.8 + ring * 2.1) * (4 + ring * 1.5)
          + Math.sin(t * 8 + i * 1.5 + ring) * 2;
        const r = baseR + vibration;
        const x = CENTER + Math.cos(angle) * r;
        const y = CENTER + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const alpha = 0.5 - ring * 0.08;
      ctx.strokeStyle = ring < 2
        ? `rgba(0, 212, 255, ${alpha})`
        : ring < 4
          ? `rgba(123, 97, 255, ${alpha * 0.8})`
          : `rgba(0, 180, 220, ${alpha * 0.5})`;
      ctx.lineWidth = 2 - ring * 0.2;
      ctx.stroke();
    }

    // === Expanding ripple waves ===
    for (let i = 0; i < 3; i++) {
      const phase = (t * 1.5 + i * 2) % 5;
      const rippleR = 50 + phase * 25;
      const alpha = Math.max(0, 0.4 - phase * 0.08);
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, rippleR, 0, Math.PI * 2);
      ctx.strokeStyle = i % 2 === 0
        ? `rgba(0, 212, 255, ${alpha})`
        : `rgba(123, 97, 255, ${alpha * 0.7})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // === Fast spinning energy arcs ===
    for (let i = 0; i < 4; i++) {
      const dir = i < 2 ? 1 : -1;
      const idx = i % 2;
      const r = 115 + idx * 15;
      const speed = (2 + idx) * dir;
      const arcLen = 0.25 + Math.sin(t * 4 + idx) * 0.1;
      const startAngle = t * speed + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.arc(CENTER, CENTER, r, startAngle, startAngle + arcLen);
      ctx.strokeStyle = idx === 0
        ? `rgba(0, 212, 255, 0.7)`
        : `rgba(123, 97, 255, 0.5)`;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // === Particle burst (energy dots) ===
    for (let i = 0; i < 12; i++) {
      const baseAngle = (i / 12) * Math.PI * 2;
      const wobble = Math.sin(t * 6 + i * 2.5) * 0.12;
      const angle = baseAngle + wobble;
      const pulse = (t * 2.5 + i * 0.5) % 3;
      const r = 60 + pulse * 18;
      const size = 2 - pulse * 0.5;
      const alpha = Math.max(0, 0.7 - pulse * 0.22);
      if (size > 0) {
        ctx.beginPath();
        ctx.arc(CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r, size, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 === 0
          ? `rgba(123, 97, 255, ${alpha})`
          : `rgba(0, 212, 255, ${alpha})`;
        ctx.fill();
      }
    }

    // === Outer energy field (flickering lines) ===
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + t * 0.6;
      const flicker = Math.sin(t * 8 + i * 3.7) * 0.5 + 0.5;
      if (flicker > 0.35) {
        const r1 = 125;
        const r2 = 125 + flicker * 15;
        ctx.beginPath();
        ctx.moveTo(CENTER + Math.cos(angle) * r1, CENTER + Math.sin(angle) * r1);
        ctx.lineTo(CENTER + Math.cos(angle) * r2, CENTER + Math.sin(angle) * r2);
        ctx.strokeStyle = `rgba(0, 212, 255, ${flicker * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }
  }

  function drawCamera(ctx: CanvasRenderingContext2D, t: number) {
    const r = 80 + Math.sin(t * 2) * 5;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232, 184, 48, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Scanning line
    const scanAngle = t * 3;
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.lineTo(CENTER + Math.cos(scanAngle) * r, CENTER + Math.sin(scanAngle) * r);
    ctx.strokeStyle = "rgba(232, 184, 48, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Scan sweep
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, r, scanAngle - 0.3, scanAngle, false);
    ctx.closePath();
    ctx.fillStyle = "rgba(232, 184, 48, 0.06)";
    ctx.fill();

    // Corner brackets for camera
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
