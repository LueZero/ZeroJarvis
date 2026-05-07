<script lang="ts">
  /**
   * Main HUD — Iron Man Jarvis-style interface (red/gold)
   */
  import Waveform from "./Waveform.svelte";
  import Subtitle from "./Subtitle.svelte";
  import CameraPreview from "./CameraPreview.svelte";
  import MapOverlay from "./MapOverlay.svelte";
  import YouTubeOverlay from "./YouTubeOverlay.svelte";
  import NotebookOverlay from "./NotebookOverlay.svelte";
  import SessionTabs from "./SessionTabs.svelte";
  import {
    getState,
    setState,
    clearCurrent,
    setSttText,
    getSttText,
    setPolish,
    appendLlmText,
    setLlmText,
    setError,
    getCameraOn,
    setCameraOn,
    getMapQuery,
    setMapQuery,
    clearMapQuery,
    getYoutubeVideoId,
    setYoutubeVideoId,
    clearYoutubeVideoId,
    getNotebookContent,
    setNotebookContent,
    clearNotebookContent,
    setSessions,
    getSessions,
    switchSession,
    updateSessionDone,
    getActiveSnapshot,
  } from "$lib/stores/agent.svelte";
  import { initVAD, startVAD, stopVAD } from "$lib/audio/vad";
  import { playAudio, stopAudio, isPlaying, ensureAudioContext } from "$lib/audio/player";
  import { connect, send, sendBinary } from "$lib/ws/client";
  import type { ServerMessage } from "@zerojarvis/shared";

  let vadReady = $state(false);
  let listening = $state(false);
  let menuOpen = $state(false);
  let audioPlaying = $state(false);
  let listenPaused = $state(false);
  let chatInput = $state("");
  let showChatInput = $state(false);


  // Connect to Gateway on mount & auto-start mic
  $effect(() => {
    connect(handleServerMessage);
    // Auto-start listening on page load
    autoStart();
    return () => {};
  });

  // Unlock AudioContext on first user interaction (fallback for autoplay policy)
  $effect(() => {
    function unlock() {
      ensureAudioContext();
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    }
    document.addEventListener("click", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  });

  async function autoStart() {
    try {
      if (!vadReady) {
        await initVAD({
          onSpeechStart() {
            setState("listening");
            setSttText("聆聽中...");
          },
          onSpeechEnd(audio) {
            console.log("HUD | speech ended, sending", audio.length, "samples to gateway");
            stopVAD();
            setState("thinking");
            setSttText("辨識中...");
            sendBinary(audio.buffer as ArrayBuffer);
          },
        });
        vadReady = true;
      }
      // Requesting mic triggers permission — once granted, AudioContext often unlocks
      await ensureAudioContext();
      clearCurrent();
      startVAD();
      listening = true;
      setState("idle");
    } catch (err: any) {
      console.warn("Auto-start failed, waiting for user gesture:", err?.message);
      // Will be started manually via button
    }
  }

  function handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "state":
        setState(msg.state);
        if (msg.state === "thinking") {
          // Clear previous response so new one starts fresh
          setLlmText("");
          // Ensure VAD is stopped during AI processing
          stopVAD();
        }
        if (msg.state === "speaking") {
          // Ensure VAD is stopped during AI speech
          stopVAD();
        }
        if (msg.state === "idle" && listening && vadReady) {
          // Only restart VAD on idle if NOT about to play audio
          // (tts_end will handle restart after audio playback)
          if (!isPlaying()) {
            startVAD();
            setSttText("");
          }
        }
        break;
      case "stt_partial":
        setSttText(msg.text);
        break;
      case "stt_final":
        setSttText(msg.text);
        break;
      case "polished":
        setPolish(msg.data);
        break;
      case "llm_delta":
        appendLlmText(msg.text);
        break;
      case "llm_done":
        setLlmText(msg.text);
        break;
      case "tts_audio":
        // Play audio, then re-enable listening after playback finishes
        audioPlaying = true;
        playAudio(msg.data).then(() => {
          audioPlaying = false;
          // Audio finished playing — now safe to listen again
          if (listening && vadReady) {
            setState("idle");
            startVAD();
            setSttText("");
          }
        }).catch((err) => {
          console.error("TTS playback failed:", err);
          audioPlaying = false;
          // Recover from playback failure — restart listening
          if (listening && vadReady) {
            setState("idle");
            startVAD();
            setSttText("");
          }
        });
        break;
      case "tts_end":
        // Server signals no more audio chunks coming
        // If audio already finished or failed, go idle immediately
        // If audio still playing, playAudio().then() will handle idle transition
        if (!audioPlaying && !isPlaying()) {
          if (listening && vadReady) {
            setState("idle");
            startVAD();
            setSttText("");
          }
        }
        break;
      case "action":
        handleAction((msg as any).action, (msg as any).payload);
        break;
      case "session_list":
        setSessions((msg as any).sessions);
        break;
      case "session_switch":
        switchSession((msg as any).sessionId, (msg as any).state);
        break;
      case "session_done":
        updateSessionDone((msg as any).sessionId, (msg as any).text);
        break;
      case "error":
        setError(msg.message);
        if (listening && vadReady) {
          startVAD();
        }
        break;
    }
  }

  /** Handle action commands from LLM */
  function handleAction(action: string, payload?: string) {
    switch (action) {
      case "CAMERA_ON":
        if (!getCameraOn()) setCameraOn(true);
        break;
      case "CAMERA_OFF":
        if (getCameraOn()) setCameraOn(false);
        break;
      case "CAPTURE":
        if (!getCameraOn()) {
          setCameraOn(true);
          // Wait for camera to initialize then capture
          setTimeout(() => triggerCapture(), 1500);
        } else {
          triggerCapture();
        }
        break;
      case "MAP":
        if (payload) setMapQuery(payload);
        break;
      case "MAP_CLOSE":
        clearMapQuery();
        break;
      case "YOUTUBE":
        if (payload) setYoutubeVideoId(payload);
        break;
      case "YOUTUBE_CLOSE":
        clearYoutubeVideoId();
        break;
      case "NOTEBOOK":
        if (payload) {
          try { setNotebookContent(JSON.parse(payload)); } catch {}
        }
        break;
      case "NOTEBOOK_CLOSE":
        clearNotebookContent();
        break;
      case "SCREENSHOT":
        triggerScreenshot();
        break;
      case "NEW_SESSION":
        send({ type: "new_chat" });
        // Don't clearCurrent() here — setSessions() will save current state
        // to the map before switching to the new (empty) session
        break;
      case "SESSION_PREV":
        send({ type: "switch_session", sessionId: "__prev__" } as any);
        break;
      case "SESSION_NEXT":
        send({ type: "switch_session", sessionId: "__next__" } as any);
        break;
      case "LISTEN_PAUSE":
        stopVAD();
        listening = false;
        listenPaused = true;
        setState("idle");
        break;
    }
  }

  function triggerCapture() {
    // Delegate to CameraPreview's capture
    import("$lib/capture/camera").then(({ captureFrame }) => {
      const frame = captureFrame();
      if (frame) {
        send({ type: "image", data: frame, query: getSttText() || "請描述你看到的內容" });
      }
    });
  }

  async function triggerScreenshot() {
    const { captureScreen } = await import("$lib/capture/screen");
    const frame = await captureScreen();
    if (frame) {
      send({ type: "image", data: frame, query: getSttText() || "請分析這個螢幕畫面" });
    }
  }

  async function startListening() {
    try {
      // Unlock AudioContext during user gesture (required by browser autoplay policy)
      await ensureAudioContext();

      if (!vadReady) {
        await initVAD({
          onSpeechStart() {
            setState("listening");
            setSttText("聆聽中...");
          },
          onSpeechEnd(audio) {
            console.log("HUD | speech ended, sending", audio.length, "samples to gateway");
            stopVAD();
            setState("thinking");
            setSttText("辨識中...");
            sendBinary(audio.buffer as ArrayBuffer);
          },
        });
        vadReady = true;
      }

      clearCurrent();
      startVAD();
      listening = true;
      setState("listening");
      menuOpen = false;
    } catch (err: any) {
      const msg = err?.name === "NotFoundError"
        ? "找不到麥克風裝置"
        : err?.name === "NotAllowedError"
          ? "麥克風權限被拒絕"
          : `麥克風初始化失敗: ${err?.message ?? err}`;
      console.error("Mic init error:", err);
      setError(msg);
    }
  }

  function stopListening() {
    stopVAD();
    listening = false;
    setState("idle");
  }

  function handleInterrupt() {
    stopAudio();
    send({ type: "interrupt" });
    clearCurrent();
    setState("idle");
  }

  function handleCameraCapture(imageBase64: string) {
    send({ type: "image", data: imageBase64, query: getSttText() || "請描述你看到的內容" });
    setCameraOn(false);
  }

  function toggleMenu() {
    menuOpen = !menuOpen;
  }

  function toggleCamera() {
    setCameraOn(!getCameraOn());
    menuOpen = false;
  }

  function handleNewChat() {
    send({ type: "new_chat" });
    menuOpen = false;
  }

  function sendChatText() {
    const text = chatInput.trim();
    if (!text) return;
    // Stop VAD while processing
    stopVAD();
    setState("thinking");
    setSttText(text);
    setLlmText("");
    send({ type: "audio_text", text });
    chatInput = "";
  }

  function handleChatKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatText();
    }
  }

  // Get display state label
  function stateLabel(s: string): string {
    switch (s) {
      case "idle": return "待命";
      case "listening": return "聆聽中";
      case "thinking": return "思考中";
      case "speaking": return "回覆中";
      case "camera": return "視覺分析";
      default: return s;
    }
  }
</script>

<div class="hud" class:has-tabs={getSessions().length > 1} class:ai-speaking={getState() === "speaking"} class:user-speaking={getState() === "listening"}>
  <!-- Edge glow -->
  <div class="edge-glow"></div>
  <!-- Grid lines -->
  <div class="grid-overlay"></div>
  <!-- Header -->
  <header class="hud-header">
    <div class="brand">
      <div class="brand-mark">
        <span class="mark-z">Z</span>
      </div>
      <h1 class="title">JARVIS</h1>
    </div>
    <div class="header-right">
      <div class="status">
        <span class="state-dot" class:active={getState() !== "idle"}></span>
        <span class="state-label">{stateLabel(getState())}</span>
        {#if listening}
          <span class="mic-dot" title="麥克風啟用中"></span>
        {/if}
      </div>
      <button class="menu-toggle" onclick={toggleMenu}>
        <span class="hamburger" class:open={menuOpen}>
          <span></span><span></span><span></span>
        </span>
      </button>

      <!-- Dropdown Menu (inside header-right for positioning) -->
      {#if menuOpen}
        <div class="menu-overlay" onclick={() => menuOpen = false}></div>
        <nav class="dropdown-menu">
          <button class="menu-item" onclick={() => { listening ? stopListening() : startListening(); }}>
            <span class="mi-icon">{listening ? '🔴' : '🎤'}</span>
            <span>{listening ? '停止聆聽' : '開始聆聽'}</span>
          </button>
          <button class="menu-item" onclick={toggleCamera}>
            <span class="mi-icon">📷</span>
            <span>{getCameraOn() ? "關閉攝像頭" : "開啟攝像頭"}</span>
          </button>
          <button class="menu-item" onclick={handleNewChat}>
            <span class="mi-icon">🔄</span>
            <span>新對話</span>
          </button>
          <button class="menu-item" onclick={() => { showChatInput = !showChatInput; menuOpen = false; }}>
            <span class="mi-icon">⌨️</span>
            <span>{showChatInput ? '隱藏輸入框' : '文字輸入'}</span>
          </button>
          {#if getState() === "speaking"}
            <button class="menu-item danger" onclick={() => { handleInterrupt(); menuOpen = false; }}>
              <span class="mi-icon">■</span>
              <span>打斷回覆</span>
            </button>
          {/if}
          <div class="menu-divider"></div>
          <div class="menu-info">
            <span class="mi-icon">⚡</span>
            <span>Groq Whisper</span>
          </div>
        </nav>
      {/if}
    </div>
  </header>

  <!-- Main Visual — Arc Reactor -->
  <div class="hud-body">
    <!-- Center content -->
    <div class="hud-main">
      <div class="hud-center">
        <Waveform />
        <div class="reactor-label">{stateLabel(getState()).toUpperCase()}</div>
      </div>
    </div>
  </div>

  <!-- Camera (fullscreen overlay, managed by CameraPreview) -->
  <CameraPreview onCapture={handleCameraCapture} />

  <!-- Map overlay (triggered by [ACTION:MAP:query]) -->
  {#if getMapQuery()}
    <MapOverlay query={getMapQuery()} onClose={clearMapQuery} />
  {/if}

  <!-- YouTube overlay (triggered by [ACTION:YOUTUBE:videoId]) -->
  {#if getYoutubeVideoId()}
    <YouTubeOverlay videoId={getYoutubeVideoId()} onClose={clearYoutubeVideoId} />
  {/if}

  <!-- NotebookLM overlay (triggered by [ACTION:NOTEBOOK:json]) -->
  {#if getNotebookContent()}
    <NotebookOverlay content={getNotebookContent()!} onClose={clearNotebookContent} />
  {/if}

  <!-- Subtitle overlay (bottom, does not push layout) -->
  <div class="hud-subtitle-overlay" class:hidden={getCameraOn() || showChatInput} class:has-tabs={getSessions().length > 1}>
    <Subtitle />
  </div>

  <!-- Text input bar (replaces subtitle area when active) -->
  {#if showChatInput}
    <div class="chat-input-bar" class:has-tabs={getSessions().length > 1}>
      <input
        type="text"
        class="chat-input"
        placeholder="輸入訊息或貼上連結..."
        bind:value={chatInput}
        onkeydown={handleChatKeydown}
      />
      <button class="chat-send-btn" onclick={sendChatText} disabled={!chatInput.trim()}>
        ➤
      </button>
    </div>
  {/if}

  <!-- Session tabs (bottom bar, only shown when >1 session) -->
  <SessionTabs onSwitch={(id) => send({ type: 'switch_session', sessionId: id } as any)} />

  <!-- Listen paused floating button -->
  {#if listenPaused}
    <button class="listen-resume-btn" onclick={() => { listenPaused = false; if (vadReady) { startVAD(); listening = true; } }}>
      🎤 恢復聆聽
    </button>
  {/if}
</div>

<style>
  .hud {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100vh;
    height: 100dvh;
    padding: 12px 16px;
    gap: 8px;
    position: relative;
    background: radial-gradient(ellipse at 50% 30%, rgba(0, 212, 255, 0.03) 0%, transparent 70%);
    overflow: hidden;
    width: 100%;
    max-width: 100vw;
    transition: box-shadow 0.5s ease;
  }

  .hud.has-tabs {
    padding-bottom: 48px;
  }

  /* === Grid Overlay (sci-fi wireframe) === */
  .grid-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
    background:
      /* Vertical lines */
      repeating-linear-gradient(
        90deg,
        rgba(0, 212, 255, 0.07) 0px,
        rgba(0, 212, 255, 0.07) 1px,
        transparent 1px,
        transparent 80px
      ),
      /* Horizontal lines */
      repeating-linear-gradient(
        0deg,
        rgba(0, 212, 255, 0.07) 0px,
        rgba(0, 212, 255, 0.07) 1px,
        transparent 1px,
        transparent 80px
      );
    mask-image: radial-gradient(ellipse at 50% 50%, black 30%, transparent 90%);
    -webkit-mask-image: radial-gradient(ellipse at 50% 50%, black 30%, transparent 90%);
  }

  /* === Edge Glow === */
  .edge-glow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 100;
    opacity: 0;
    transition: opacity 0.4s ease;
    box-shadow:
      inset 0 0 30px rgba(0, 212, 255, 0.2),
      inset 0 0 60px rgba(0, 212, 255, 0.08),
      0 0 20px rgba(0, 212, 255, 0.1);
  }

  /* AI Speaking: cyan glow pulse */
  .hud.ai-speaking .edge-glow {
    opacity: 1;
    animation: glow-ai 1.2s ease-in-out infinite;
  }

  /* User Speaking: purple vibrate glow */
  .hud.user-speaking .edge-glow {
    opacity: 1;
    animation: glow-user 0.4s ease-in-out infinite;
  }

  /* Also light up the grid when speaking */
  .hud.ai-speaking .grid-overlay {
    background:
      repeating-linear-gradient(
        90deg,
        rgba(0, 212, 255, 0.05) 0px,
        rgba(0, 212, 255, 0.05) 1px,
        transparent 1px,
        transparent 80px
      ),
      repeating-linear-gradient(
        0deg,
        rgba(0, 212, 255, 0.05) 0px,
        rgba(0, 212, 255, 0.05) 1px,
        transparent 1px,
        transparent 80px
      );
    animation: grid-pulse-ai 2s ease-in-out infinite;
  }

  .hud.user-speaking .grid-overlay {
    background:
      repeating-linear-gradient(
        90deg,
        rgba(123, 97, 255, 0.05) 0px,
        rgba(123, 97, 255, 0.05) 1px,
        transparent 1px,
        transparent 80px
      ),
      repeating-linear-gradient(
        0deg,
        rgba(123, 97, 255, 0.05) 0px,
        rgba(123, 97, 255, 0.05) 1px,
        transparent 1px,
        transparent 80px
      );
    animation: grid-pulse-user 0.8s ease-in-out infinite;
  }

  @keyframes glow-ai {
    0%, 100% {
      box-shadow:
        inset 0 0 25px rgba(0, 212, 255, 0.15),
        inset 0 0 50px rgba(0, 212, 255, 0.06),
        0 0 15px rgba(0, 212, 255, 0.08);
    }
    50% {
      box-shadow:
        inset 0 0 45px rgba(0, 212, 255, 0.3),
        inset 0 0 80px rgba(0, 212, 255, 0.12),
        0 0 35px rgba(0, 212, 255, 0.18);
    }
  }

  @keyframes glow-user {
    0%, 100% {
      box-shadow:
        inset 0 0 20px rgba(123, 97, 255, 0.2),
        inset 0 0 45px rgba(123, 97, 255, 0.08),
        0 0 12px rgba(123, 97, 255, 0.1);
    }
    50% {
      box-shadow:
        inset 0 0 50px rgba(123, 97, 255, 0.38),
        inset 0 0 90px rgba(123, 97, 255, 0.15),
        0 0 40px rgba(123, 97, 255, 0.22);
    }
  }

  @keyframes grid-pulse-ai {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @keyframes grid-pulse-user {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Header */
  .hud-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 4px 0;
    position: relative;
    z-index: 30;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-mark {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(123, 97, 255, 0.1));
    border: 1px solid rgba(0, 212, 255, 0.25);
  }

  .mark-z {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--accent);
    line-height: 1;
  }

  .title {
    font-size: 0.9rem;
    font-weight: 500;
    letter-spacing: 0.18em;
    color: var(--text);
    opacity: 0.85;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
    position: relative;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--text-dim);
    letter-spacing: 0.1em;
  }

  .state-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-dim);
    transition: all 0.3s;
  }

  .state-dot.active {
    background: var(--accent);
    box-shadow: 0 0 10px var(--accent), 0 0 20px rgba(0, 212, 255, 0.3);
    animation: pulse 1.5s infinite;
  }

  .mic-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 6px var(--success);
    animation: pulse 1.5s infinite;
  }

  /* Menu */
  .menu-toggle {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    transition: background 0.2s;
  }
  .menu-toggle:hover {
    background: var(--accent-soft);
  }

  .hamburger {
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: all 0.3s;
  }
  .hamburger span {
    display: block;
    width: 18px;
    height: 1.5px;
    background: var(--text-dim);
    transition: all 0.3s;
    border-radius: 1px;
  }
  .hamburger.open span:nth-child(1) {
    transform: rotate(45deg) translate(4px, 4px);
    background: var(--accent);
  }
  .hamburger.open span:nth-child(2) {
    opacity: 0;
  }
  .hamburger.open span:nth-child(3) {
    transform: rotate(-45deg) translate(4px, -4px);
    background: var(--accent);
  }

  .menu-overlay {
    position: fixed;
    inset: 0;
    z-index: 10;
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 20;
    background: rgba(20, 8, 10, 0.97);
    border: 1px solid var(--accent-dim);
    border-radius: var(--radius);
    padding: 6px;
    min-width: 200px;
    max-width: calc(100vw - 32px);
    backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 212, 255, 0.06);
    animation: menuSlide 0.15s ease;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 0.9rem;
    color: var(--text);
    transition: background 0.15s;
    text-align: left;
  }
  .menu-item:hover {
    background: var(--accent-soft);
    color: var(--accent);
  }

  .menu-divider {
    height: 1px;
    background: var(--accent-dim);
    margin: 4px 8px;
  }

  .menu-info {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    font-size: 0.75rem;
    color: var(--text-dim);
  }

  .mi-icon {
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }

  /* Arc Reactor area */
  .hud-body {
    flex: 1;
    display: flex;
    width: 100%;
    min-height: 0;
    gap: 12px;
    overflow: hidden;
  }

  .hud-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    gap: 6px;
    overflow: hidden;
  }

  .hud-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
  }

  .reactor-label {
    font-size: 0.7rem;
    letter-spacing: 0.3em;
    color: var(--text-dim);
    text-transform: uppercase;
  }

  /* Subtitle — bottom overlay, doesn't push layout */
  .hud-subtitle-overlay {
    position: absolute;
    bottom: 24px;
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 20;
    max-height: 35vh;
    overflow-y: auto;
    scrollbar-width: none;
    transition: opacity 0.3s, bottom 0.3s;
  }
  .hud-subtitle-overlay.has-tabs {
    bottom: 56px;
  }
  .hud-subtitle-overlay::-webkit-scrollbar {
    display: none;
  }
  .hud-subtitle-overlay.hidden {
    opacity: 0;
    pointer-events: none;
  }

  /* Menu danger item */
  .menu-item.danger {
    color: var(--danger);
  }
  .menu-item.danger:hover {
    background: rgba(255, 85, 119, 0.1);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes menuSlide {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* === Responsive === */
  @media (max-width: 600px) {
    .hud {
      padding: 8px;
      gap: 6px;
    }

    .title {
      font-size: 0.78rem;
      letter-spacing: 0.12em;
    }

    .brand-mark {
      width: 22px;
      height: 22px;
      border-radius: 5px;
    }

    .mark-z {
      font-size: 0.7rem;
    }

    .status {
      font-size: 0.65rem;
    }

    .header-right {
      gap: 10px;
    }

    .hud-center {
      margin: 0;
    }

    .reactor-label {
      font-size: 0.6rem;
    }

    .ctrl-btn {
      padding: 12px 24px;
      font-size: 0.85rem;
    }

    .dropdown-menu {
      min-width: 180px;
    }

    .menu-item {
      padding: 10px;
      font-size: 0.85rem;
    }
  }

  @media (max-width: 380px) {
    .title {
      font-size: 0.75rem;
      letter-spacing: 0.15em;
    }

    .ctrl-btn {
      padding: 10px 18px;
      font-size: 0.8rem;
      gap: 6px;
    }
  }

  /* Listen paused floating button */
  .listen-resume-btn {
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    padding: 14px 28px;
    border-radius: 30px;
    border: 1px solid rgba(0, 212, 255, 0.6);
    background: rgba(0, 20, 40, 0.9);
    color: #00d4ff;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    backdrop-filter: blur(10px);
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 10px rgba(0, 212, 255, 0.1);
    animation: pulse-listen 2s ease-in-out infinite;
  }

  .listen-resume-btn:hover {
    background: rgba(0, 40, 60, 0.95);
    box-shadow: 0 0 30px rgba(0, 212, 255, 0.5);
  }

  @keyframes pulse-listen {
    0%, 100% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.3); }
    50% { box-shadow: 0 0 30px rgba(0, 212, 255, 0.6); }
  }

  /* Chat input bar — same position as subtitle */
  .chat-input-bar {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% - 32px);
    max-width: 600px;
    padding: 8px 12px;
    border-radius: 24px;
    border: 1px solid rgba(0, 212, 255, 0.3);
    background: rgba(10, 15, 30, 0.9);
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  }

  .chat-input-bar.has-tabs {
    bottom: 56px;
  }

  .chat-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: #e8eaf0;
    font-size: 0.95rem;
    padding: 6px 4px;
    font-family: inherit;
  }

  .chat-input::placeholder {
    color: rgba(200, 210, 230, 0.4);
  }

  .chat-send-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid rgba(0, 212, 255, 0.4);
    background: rgba(0, 212, 255, 0.1);
    color: #00d4ff;
    font-size: 1.1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .chat-send-btn:hover:not(:disabled) {
    background: rgba(0, 212, 255, 0.2);
    box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
  }

  .chat-send-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
