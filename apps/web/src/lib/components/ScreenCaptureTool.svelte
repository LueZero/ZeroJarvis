<script lang="ts">
  /**
   * ScreenCaptureTool — Region selection + annotation overlay
   * 
   * Flow:
   * 1. First time: getDisplayMedia → persistent stream
   * 2. Grab frame from stream → show in fullscreen overlay
   * 3. User draws selection rectangle (drag)
   * 4. User can add border annotations (click to add rect outlines)
   * 5. User clicks "送出" → crops + annotates → base64 → callback
   */

  interface Props {
    active: boolean;
    onCapture: (base64: string) => void;
    onCancel: () => void;
  }

  let { active, onCapture, onCancel }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let overlayCanvas: HTMLCanvasElement | undefined = $state();
  let frameData: ImageData | null = $state(null);
  let frameImage: HTMLImageElement | null = $state(null);
  let imgWidth = $state(0);
  let imgHeight = $state(0);

  // Selection state
  let selecting = $state(false);
  let selStart = $state({ x: 0, y: 0 });
  let selEnd = $state({ x: 0, y: 0 });
  let hasSelection = $state(false);

  // Annotation state
  let annotations: { x: number; y: number; w: number; h: number; color: string }[] = $state([]);
  let annotating = $state(false);
  let annoStart = $state({ x: 0, y: 0 });
  let annoEnd = $state({ x: 0, y: 0 });
  let annoColor = $state("#ff0000");

  // Mode: "select" or "annotate"
  let mode: "select" | "annotate" = $state("select");

  // Persistent stream
  let stream: MediaStream | null = null;

  $effect(() => {
    if (active) {
      captureFrame();
    }
  });

  async function getStream(): Promise<MediaStream> {
    if (stream && stream.active) return stream;
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor" } as any,
      audio: false,
    });
    // When user stops sharing via browser UI
    stream.getVideoTracks()[0].addEventListener("ended", () => {
      stream = null;
    });
    return stream;
  }

  async function captureFrame() {
    try {
      const s = await getStream();
      const track = s.getVideoTracks()[0];
      const settings = track.getSettings();
      const w = settings.width || 1920;
      const h = settings.height || 1080;
      imgWidth = w;
      imgHeight = h;

      // Use ImageCapture API if available, fallback to video element
      if ("ImageCapture" in window) {
        const capture = new ImageCapture(track);
        const bitmap = await capture.grabFrame();
        // Draw to temp canvas to get image
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = bitmap.width;
        tempCanvas.height = bitmap.height;
        const ctx = tempCanvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        imgWidth = bitmap.width;
        imgHeight = bitmap.height;
        
        const img = new Image();
        img.src = tempCanvas.toDataURL("image/jpeg", 0.95);
        await new Promise(r => img.onload = r);
        frameImage = img;
      } else {
        // Fallback: video element
        const video = document.createElement("video");
        video.srcObject = s;
        video.muted = true;
        await video.play();
        await new Promise(r => setTimeout(r, 200)); // Wait for frame

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        imgWidth = video.videoWidth;
        imgHeight = video.videoHeight;
        const ctx = tempCanvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0);
        video.pause();

        const img = new Image();
        img.src = tempCanvas.toDataURL("image/jpeg", 0.95);
        await new Promise(r => img.onload = r);
        frameImage = img;
      }

      // Reset state
      hasSelection = false;
      annotations = [];
      mode = "select";
      
      // Draw once ready
      requestAnimationFrame(() => drawAll());
    } catch (err: any) {
      console.error("Screen capture failed:", err);
      onCancel();
    }
  }

  function drawAll() {
    if (!canvas || !frameImage) return;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * devicePixelRatio;
    canvas.height = rect.height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Draw full screenshot scaled to fit
    const scale = Math.min(rect.width / imgWidth, rect.height / imgHeight);
    const drawW = imgWidth * scale;
    const drawH = imgHeight * scale;
    const offsetX = (rect.width - drawW) / 2;
    const offsetY = (rect.height - drawH) / 2;

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.drawImage(frameImage, offsetX, offsetY, drawW, drawH);

    // Draw selection dimming
    if (hasSelection) {
      const sx = Math.min(selStart.x, selEnd.x);
      const sy = Math.min(selStart.y, selEnd.y);
      const sw = Math.abs(selEnd.x - selStart.x);
      const sh = Math.abs(selEnd.y - selStart.y);

      // Dim outside selection
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, rect.width, sy);
      ctx.fillRect(0, sy + sh, rect.width, rect.height - sy - sh);
      ctx.fillRect(0, sy, sx, sh);
      ctx.fillRect(sx + sw, sy, rect.width - sx - sw, sh);

      // Selection border
      ctx.strokeStyle = "#00ffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }

    // Draw annotations
    for (const a of annotations) {
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 3;
      ctx.strokeRect(a.x, a.y, a.w, a.h);
    }

    // Draw in-progress annotation
    if (annotating) {
      const ax = Math.min(annoStart.x, annoEnd.x);
      const ay = Math.min(annoStart.y, annoEnd.y);
      const aw = Math.abs(annoEnd.x - annoStart.x);
      const ah = Math.abs(annoEnd.y - annoStart.y);
      ctx.strokeStyle = annoColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(ax, ay, aw, ah);
      ctx.setLineDash([]);
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (mode === "select") {
      selecting = true;
      selStart = { x, y };
      selEnd = { x, y };
      hasSelection = false;
    } else {
      annotating = true;
      annoStart = { x, y };
      annoEnd = { x, y };
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (selecting) {
      selEnd = { x, y };
      drawAll();
    } else if (annotating) {
      annoEnd = { x, y };
      drawAll();
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (selecting) {
      selecting = false;
      // Minimum 20px selection
      if (Math.abs(selEnd.x - selStart.x) > 20 && Math.abs(selEnd.y - selStart.y) > 20) {
        hasSelection = true;
      }
      drawAll();
    } else if (annotating) {
      annotating = false;
      if (Math.abs(annoEnd.x - annoStart.x) > 10 && Math.abs(annoEnd.y - annoStart.y) > 10) {
        annotations = [...annotations, {
          x: Math.min(annoStart.x, annoEnd.x),
          y: Math.min(annoStart.y, annoEnd.y),
          w: Math.abs(annoEnd.x - annoStart.x),
          h: Math.abs(annoEnd.y - annoStart.y),
          color: annoColor,
        }];
      }
      drawAll();
    }
  }

  function undoAnnotation() {
    annotations = annotations.slice(0, -1);
    drawAll();
  }

  function submitCapture() {
    if (!canvas || !frameImage) return;

    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / imgWidth, rect.height / imgHeight);
    const drawW = imgWidth * scale;
    const drawH = imgHeight * scale;
    const offsetX = (rect.width - drawW) / 2;
    const offsetY = (rect.height - drawH) / 2;

    // Determine crop region in original image coords
    let cropX = 0, cropY = 0, cropW = imgWidth, cropH = imgHeight;
    if (hasSelection) {
      const sx = Math.min(selStart.x, selEnd.x);
      const sy = Math.min(selStart.y, selEnd.y);
      const sw = Math.abs(selEnd.x - selStart.x);
      const sh = Math.abs(selEnd.y - selStart.y);
      // Convert canvas coords to image coords
      cropX = Math.max(0, Math.round((sx - offsetX) / scale));
      cropY = Math.max(0, Math.round((sy - offsetY) / scale));
      cropW = Math.min(imgWidth - cropX, Math.round(sw / scale));
      cropH = Math.min(imgHeight - cropY, Math.round(sh / scale));
    }

    // Create output canvas with cropped region + annotations
    const outCanvas = document.createElement("canvas");
    outCanvas.width = cropW;
    outCanvas.height = cropH;
    const ctx = outCanvas.getContext("2d")!;
    ctx.drawImage(frameImage, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Draw annotations (convert from canvas coords to crop coords)
    for (const a of annotations) {
      const ax = (a.x - offsetX) / scale - cropX;
      const ay = (a.y - offsetY) / scale - cropY;
      const aw = a.w / scale;
      const ah = a.h / scale;
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 4;
      ctx.strokeRect(ax, ay, aw, ah);
    }

    const base64 = outCanvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    onCapture(base64);
  }

  function cancel() {
    hasSelection = false;
    annotations = [];
    onCancel();
  }

  function selectAll() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    selStart = { x: 0, y: 0 };
    selEnd = { x: rect.width, y: rect.height };
    hasSelection = true;
    drawAll();
  }
</script>

{#if active && frameImage}
  <div class="capture-overlay">
    <!-- Toolbar -->
    <div class="capture-toolbar">
      <div class="toolbar-left">
        <button
          class="tool-btn"
          class:active={mode === "select"}
          onclick={() => { mode = "select"; }}
          title="框選區域"
        >
          ✂️ 框選
        </button>
        <button
          class="tool-btn"
          class:active={mode === "annotate"}
          onclick={() => { mode = "annotate"; }}
          title="加標註框"
        >
          🖊️ 標註
        </button>
        {#if mode === "annotate"}
          <input type="color" bind:value={annoColor} class="color-picker" title="標註顏色" />
          <button class="tool-btn" onclick={undoAnnotation} disabled={annotations.length === 0} title="復原標註">
            ↩️
          </button>
        {/if}
        <button class="tool-btn" onclick={selectAll} title="全螢幕">
          🖥️ 全選
        </button>
      </div>
      <div class="toolbar-right">
        <button class="tool-btn cancel" onclick={cancel}>✕ 取消</button>
        <button class="tool-btn submit" onclick={submitCapture} disabled={!hasSelection && annotations.length === 0}>
          ➤ 送出分析
        </button>
      </div>
    </div>

    <!-- Canvas -->
    <canvas
      bind:this={canvas}
      class="capture-canvas"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
    ></canvas>

    <!-- Hint -->
    {#if !hasSelection && mode === "select"}
      <div class="capture-hint">拖拽框選要分析的區域，或點「全選」截取整個螢幕</div>
    {:else if mode === "annotate"}
      <div class="capture-hint">拖拽畫出標註框，幫 AI 注意重點區域</div>
    {/if}
  </div>
{/if}

<style>
  .capture-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.92);
    display: flex;
    flex-direction: column;
    user-select: none;
  }

  .capture-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: rgba(20, 20, 30, 0.95);
    border-bottom: 1px solid rgba(0, 255, 255, 0.3);
    gap: 8px;
    flex-shrink: 0;
  }

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tool-btn {
    padding: 6px 14px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    color: #e0e0e0;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tool-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(0, 255, 255, 0.5);
  }

  .tool-btn.active {
    background: rgba(0, 255, 255, 0.15);
    border-color: #00ffff;
    color: #00ffff;
  }

  .tool-btn.submit {
    background: rgba(0, 200, 100, 0.2);
    border-color: #00c864;
    color: #00c864;
    font-weight: 600;
  }

  .tool-btn.submit:hover:not(:disabled) {
    background: rgba(0, 200, 100, 0.35);
  }

  .tool-btn.cancel {
    color: #ff6666;
    border-color: rgba(255, 100, 100, 0.3);
  }

  .tool-btn.cancel:hover {
    background: rgba(255, 0, 0, 0.1);
  }

  .tool-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .color-picker {
    width: 32px;
    height: 28px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background: transparent;
  }

  .capture-canvas {
    flex: 1;
    width: 100%;
    cursor: crosshair;
    touch-action: none;
  }

  .capture-hint {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 20px;
    background: rgba(0, 0, 0, 0.8);
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 20px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    pointer-events: none;
  }
</style>
