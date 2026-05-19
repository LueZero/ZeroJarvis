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
  import ScreenCaptureTool from "./ScreenCaptureTool.svelte";
  import TaskPanel from "./TaskPanel.svelte";
  import SummaryPanel from "./SummaryPanel.svelte";
  import SideHUD from "./SideHUD.svelte";
  import TaskPopups from "./TaskPopups.svelte";
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
    getFoodData,
    setFoodData,
    getYouTubeData,
    setYouTubeData,
    clearYouTubeData,
    getNotebookContent,
    setNotebookContent,
    clearNotebookContent,
    setSessions,
    getSessions,
    switchSession,
    updateSessionDone,
    getActiveSnapshot,
    addTaskNotification,
    popTaskNotification,
    getPendingNotifications,
    incrementActiveTaskCount,
    decrementActiveTaskCount,
    getActiveTaskCount,
    addTask,
    completeTask,
    failTask,
    removeTask,
    getTaskItems,
    getTaskPanelOpen,
    setTaskPanelOpen,
    setTokenUsage,
    setLastCompactSuccess,
    pushActivity,
    clearActivityFeed,
  } from "$lib/stores/agent.svelte";
  import { initVAD, startVAD, stopVAD, isVADActive } from "$lib/audio/vad";
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
  let screenshotActive = $state(false);
  let notebookRef: NotebookOverlay | undefined = $state(undefined);

  /** Buffered audio from speech that ended while AI was busy */
  let pendingAudio: ArrayBuffer | null = null;

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

  // Keyboard shortcut: M key toggles listening (unless typing in input)
  $effect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleListening();
      }
    }
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });

  async function autoStart() {
    try {
      if (!vadReady) {
        await initVAD({
          onSpeechStart() {
            // Guard: race condition — VAD event fired after stopVAD
            if (!isVADActive()) return;
            // Guard: don't trigger if mic is paused or AI is busy
            if (listenPaused || !listening) {
              console.log("HUD | onSpeechStart blocked — mic paused");
              return;
            }
            if (isBusy()) {
              console.log("HUD | onSpeechStart blocked — AI is", getState());
              return;
            }
            setState("listening");
            setSttText("聆聽中...");
          },
          onSpeechEnd(audio) {
            // If AI is busy, buffer the audio and send when idle
            if (isBusy()) {
              console.log("HUD | speech ended while busy, buffering", audio.length, "samples");
              pendingAudio = audio.buffer as ArrayBuffer;
              return;
            }
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
      // Surface friendly error so user knows why the mic didn't start
      const name = err?.name;
      const msg = name === "NotFoundError"
        ? "找不到麥克風裝置，請確認系統有可用的錄音設備"
        : name === "NotAllowedError"
          ? "麥克風權限被拒絕，請在瀏覽器設定中允許麥克風存取"
          : name === "NotReadableError"
            ? "麥克風被其他程式佔用中"
            : `麥克風初始化失敗：${err?.message ?? err}`;
      setError(msg);
      listening = false;
      listenPaused = true;
    }
  }

  function handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case "state":
        setState(msg.state);
        if (msg.state === "thinking") {
          // Clear previous response so new one starts fresh
          setLlmText("");
          clearActivityFeed();
          // Ensure VAD is stopped during AI processing
          stopVAD();
        }
        if (msg.state === "speaking") {
          // Ensure VAD is stopped during AI speech
          stopVAD();
        }
        if (msg.state === "idle") {
          // Always flush pending audio (even if user paused mic — speech was already captured)
          if (pendingAudio) {
            console.log("HUD | idle — sending buffered audio");
            const buf = pendingAudio;
            pendingAudio = null;
            setState("thinking");
            setSttText("辨識中...");
            sendBinary(buf);
          } else if (listening && !listenPaused && vadReady && !isPlaying()) {
            // Only restart VAD if mic is on and not about to play audio
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
          // Audio finished — always go idle, only restart VAD if not paused
          setState("idle");
          setSttText("");
          // Always flush pending audio (even if mic paused — speech was already captured)
          if (pendingAudio) {
            console.log("HUD | TTS done — sending buffered audio");
            const buf = pendingAudio;
            pendingAudio = null;
            setState("thinking");
            setSttText("辨識中...");
            sendBinary(buf);
          } else if (listening && !listenPaused && vadReady) {
            startVAD();
          }
        }).catch((err) => {
          console.error("TTS playback failed:", err);
          audioPlaying = false;
          setState("idle");
          setSttText("");
          if (listening && !listenPaused && vadReady) {
            startVAD();
          }
        });
        break;
      case "tts_end":
        // Server signals no more audio chunks coming
        // If audio already finished or failed, go idle immediately
        // If audio still playing, playAudio().then() will handle idle transition
        if (!audioPlaying && !isPlaying()) {
          setState("idle");
          setSttText("");
          // Flush pending audio first, then consider restarting VAD
          if (pendingAudio) {
            console.log("HUD | tts_end — sending buffered audio");
            const buf = pendingAudio;
            pendingAudio = null;
            setState("thinking");
            setSttText("辨識中...");
            sendBinary(buf);
          } else if (listening && !listenPaused && vadReady) {
            startVAD();
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
        // Stop any playing audio & reset before switching
        stopAudio();
        audioPlaying = false;
        switchSession((msg as any).sessionId, (msg as any).state);
        // After switch, if new session is idle and mic is on, restart VAD
        if (getState() === "idle" && listening && !listenPaused && vadReady) {
          startVAD();
        } else if (getState() !== "idle") {
          // Non-idle loaded state (e.g. thinking from background) — stop VAD
          stopVAD();
        }
        break;
      case "session_done":
        updateSessionDone((msg as any).sessionId, (msg as any).text);
        break;
      case "task_created":
        incrementActiveTaskCount();
        addTask((msg as any).taskId, (msg as any).description);
        console.log(`📋 Task created: ${(msg as any).description}`);
        break;
      case "task_done": {
        decrementActiveTaskCount();
        const taskText = (msg as any).text as string;
        const taskId = (msg as any).taskId as string;
        completeTask(taskId, taskText);
        console.log(`✅ Task done: ${taskText.slice(0, 80)}`);
        // Server will send TTS audio right after this message.
        // Pause VAD so mic doesn't interfere during task result playback.
        if (vadReady) {
          stopVAD();
        }
        break;
      }
      case "task_error":
        decrementActiveTaskCount();
        failTask((msg as any).taskId, (msg as any).error);
        console.error(`❌ Task error: ${(msg as any).error}`);
        break;
      case "task_deleted":
        removeTask((msg as any).taskId);
        break;
      case "token_update":
        setTokenUsage((msg as any).usage);
        break;
      case "session_summary":
        setLastCompactSuccess((msg as any).success);
        break;
      case "activity":
        pushActivity((msg as any).event);
        break;
      case "food_results":
        setFoodData((msg as any).data);
        break;
      case "youtube_results":
        setYouTubeData((msg as any).data);
        break;
      case "error":
        setError(msg.message);
        if (listening && !listenPaused && vadReady) {
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
      case "SCREENSHOT":
        screenshotActive = true;
        break;
      case "MAP":
        if (payload) setMapQuery(payload);
        break;
      case "MAP_CLOSE":
        clearMapQuery();
        break;
      case "YOUTUBE":
        if (payload) {
          try {
            const yt = JSON.parse(payload);
            setYouTubeData(yt);
          } catch {}
        }
        break;
      case "YOUTUBE_CLOSE":
        clearYouTubeData();
        break;
      case "YOUTUBE_URL":
        if (payload) {
          try { window.open(payload, "_blank", "noopener"); } catch {}
        }
        break;
      case "NOTEBOOK":
        if (payload) {
          try {
            const nc = JSON.parse(payload);
            setNotebookContent(nc);
            send({ type: "notebook_state", active: true, contentType: nc.type } as any);
          } catch {}
        }
        break;
      case "NOTEBOOK_CLOSE":
        clearNotebookContent();
        send({ type: "notebook_state", active: false } as any);
        break;
      case "NOTEBOOK_CMD":
        if (payload && notebookRef) {
          try { notebookRef.handleVoiceCommand(JSON.parse(payload)); } catch {}
        }
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
        toggleListening("off");
        break;
      case "LISTEN_RESUME":
        toggleListening("on");
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

  /** Check if AI is currently busy (thinking or speaking) */
  function isBusy(): boolean {
    const s = getState();
    return s === "thinking" || s === "speaking";
  }

  /** Unified listening control — single source of truth for all toggle paths */
  async function toggleListening(forceState?: "on" | "off") {
    const isOn = listening && !listenPaused;
    const wantOn = forceState ? forceState === "on" : !isOn;

    if (wantOn) {
      // === Turn ON ===
      if (isBusy()) {
        // AI is busy — don't start VAD now, but set flags so VAD
        // auto-starts once AI returns to idle (handleServerMessage idle branch)
        console.log("HUD | toggleListening: queued ON for after", getState());
        listening = true;
        listenPaused = false;
        return;
      }
      try {
        await ensureAudioContext();
        if (!vadReady) {
          await initVAD({
            onSpeechStart() {
              // Guard: race condition — VAD event fired after stopVAD
              if (!isVADActive()) return;
              // Guard: don't trigger if mic is paused or AI is busy
              if (listenPaused || !listening) {
                console.log("HUD | onSpeechStart blocked — mic paused");
                return;
              }
              if (isBusy()) {
                console.log("HUD | onSpeechStart blocked — AI is", getState());
                return;
              }
              setState("listening");
              setSttText("聆聽中...");
            },
            onSpeechEnd(audio) {
              // If AI is busy, buffer the audio and send when idle
              if (isBusy()) {
                console.log("HUD | speech ended while busy, buffering", audio.length, "samples");
                pendingAudio = audio.buffer as ArrayBuffer;
                return;
              }
              console.log("HUD | speech ended, sending", audio.length, "samples to gateway");
              stopVAD();
              setState("thinking");
              setSttText("辨識中...");
              sendBinary(audio.buffer as ArrayBuffer);
            },
          });
          vadReady = true;
        }
        startVAD();
        listening = true;
        listenPaused = false;
        // Only set idle if not currently in thinking/speaking (AI may still be processing)
        if (getState() === "listening" || getState() === "camera") {
          setState("idle");
        }
      } catch (err: any) {
        const msg = err?.name === "NotFoundError"
          ? "找不到麥克風裝置"
          : err?.name === "NotAllowedError"
            ? "麥克風權限被拒絕"
            : `麥克風初始化失敗: ${err?.message ?? err}`;
        console.error("Mic init error:", err);
        setError(msg);
      }
    } else {
      // === Turn OFF ===
      // Set flags BEFORE stopping VAD so submitUserSpeechOnPause callback sees paused state
      listening = false;
      listenPaused = true;
      stopVAD();
      // Only reset to idle if currently listening; don't interrupt speaking/thinking state
      if (getState() === "listening") {
        setState("idle");
      }
    }
    menuOpen = false;
  }

  // Legacy wrappers (used by autoStart and internal flows that need non-toggle behavior)
  async function startListening() { await toggleListening("on"); }
  function stopListening() { toggleListening("off"); }

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

  function handleScreenshotCapture(base64: string) {
    screenshotActive = false;
    send({ type: "screenshot_response", data: base64 } as any);
  }

  function handleScreenshotCancel() {
    screenshotActive = false;
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
    // Block: cannot send text while AI is thinking or speaking
    if (isBusy()) {
      console.log("HUD | sendChatText blocked — AI is", getState());
      return;
    }
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

<div class="hud" class:has-tabs={getSessions().length > 1} class:has-input={showChatInput} class:ai-speaking={getState() === "speaking"} class:user-speaking={getState() === "listening"} class:ai-thinking={getState() === "thinking"}>
  <!-- Edge glow -->
  <div class="edge-glow"></div>
  <!-- Sci-fi side panels (thinking / tool-use) -->
  <SideHUD />
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
      <!-- Task badge inline in header -->
      <TaskPanel anchor="header" />
      <SummaryPanel />
      <button class="menu-toggle" onclick={toggleMenu}>
        <span class="hamburger" class:open={menuOpen}>
          <span></span><span></span><span></span>
        </span>
      </button>

      <!-- Dropdown Menu (inside header-right for positioning) -->
      {#if menuOpen}
        <div class="menu-overlay" onclick={() => menuOpen = false}></div>
        <nav class="dropdown-menu">
          <button class="menu-item" onclick={() => toggleListening()}>
            <span class="mi-icon">{listening && !listenPaused ? '🔴' : '🎤'}</span>
            <span>{listening && !listenPaused ? '停止聆聽 (M)' : '開始聆聽 (M)'}</span>
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

  <!-- Screenshot region selection + annotation tool -->
  <ScreenCaptureTool active={screenshotActive} onCapture={handleScreenshotCapture} onCancel={handleScreenshotCancel} />

  <!-- Map overlay (triggered by [ACTION:MAP:query]) -->
  {#if getMapQuery()}
    <MapOverlay query={getMapQuery()} foodData={getFoodData()} onClose={clearMapQuery} />
  {/if}

  <!-- YouTube overlay (triggered by [ACTION:YOUTUBE:json] or youtube_results) -->
  {#if getYouTubeData()}
    <YouTubeOverlay data={getYouTubeData()!} onClose={clearYouTubeData} />
  {/if}

  <!-- NotebookLM overlay (triggered by [ACTION:NOTEBOOK:json]) -->
  {#if getNotebookContent()}
    <NotebookOverlay bind:this={notebookRef} content={getNotebookContent()!} onClose={() => { clearNotebookContent(); send({ type: "notebook_state", active: false } as any); }} />
  {/if}

  <!-- Conversation holo windows (AI / User / Error — draggable & closable) -->
  <!-- Hidden when a fullscreen overlay is active (camera/map/notebook/screenshot) -->
  {#if !getCameraOn() && !getMapQuery() && !getYouTubeData() && !getNotebookContent() && !screenshotActive}
    <Subtitle />
  {/if}

  <!-- Background task popups (also hidden under fullscreen overlays to avoid -->
  <!-- visually-trapped panels behind opaque overlays) -->
  {#if !getCameraOn() && !getMapQuery() && !getYouTubeData() && !getNotebookContent() && !screenshotActive}
    <TaskPopups />
  {/if}

  <!-- Text input — Sci-fi command console (also hidden under fullscreen overlays) -->
  {#if showChatInput && !getCameraOn() && !getMapQuery() && !getYouTubeData() && !getNotebookContent() && !screenshotActive}
    <div
      class="cmd-console"
      class:has-tabs={getSessions().length > 1}
      class:capturing={chatInput.trim().length > 0}
      class:listening={listening && !listenPaused && getState() === "listening"}
    >
      <!-- Outer capture frame (animates when typing or voice listening) -->
      <div class="cc-capture-frame" aria-hidden="true">
        <span class="ccf c1"></span><span class="ccf c2"></span>
        <span class="ccf c3"></span><span class="ccf c4"></span>
      </div>
      <div class="cc-bracket tl"></div>
      <div class="cc-bracket tr"></div>
      <div class="cc-bracket bl"></div>
      <div class="cc-bracket br"></div>
      <div class="cc-rail"></div>

      <div class="cc-prefix">
        <span class="cc-chevron">&gt;</span>
        <span class="cc-label">CMD</span>
        <span class="cc-divider">/</span>
        <span class="cc-target">JARVIS</span>
      </div>

      <input
        type="text"
        class="cmd-input"
        placeholder="輸入指令、貼上連結或描述任務..."
        spellcheck="false"
        autocomplete="off"
        bind:value={chatInput}
        onkeydown={handleChatKeydown}
      />

      <div class="cc-meta">
        <span class="cc-count">{chatInput.length.toString().padStart(3, '0')}</span>
        <span class="cc-divider">/</span>
        <span class="cc-hint">↵ SEND</span>
      </div>

      <button class="cc-send" onclick={sendChatText} disabled={!chatInput.trim()} title="送出">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="square" stroke-linejoin="miter"/>
        </svg>
      </button>
    </div>
  {/if}

  <!-- Session tabs (bottom bar, only shown when >1 session and no fullscreen overlay) -->
  {#if !getCameraOn() && !getMapQuery() && !getYouTubeData() && !getNotebookContent() && !screenshotActive}
    <SessionTabs onSwitch={(id) => send({ type: 'switch_session', sessionId: id } as any)} />
  {/if}

  <!-- Persistent floating mic toggle button (always visible for walk-around use) -->
  <button
    class="mic-fab"
    class:mic-on={listening && !listenPaused}
    class:mic-paused={listenPaused}
    class:mic-capturing={getState() === "listening"}
    onclick={() => toggleListening()}
    title={listening && !listenPaused ? "暫停收聽 (M)" : "開始收聽 (M)"}
  >
    <!-- Voice capture scan frame -->
    <span class="mic-frame" aria-hidden="true">
      <span class="mf c1"></span><span class="mf c2"></span>
      <span class="mf c3"></span><span class="mf c4"></span>
      <span class="mf-ring"></span>
    </span>
    {#if listening && !listenPaused}
      <svg class="mic-fab-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
    {:else}
      <svg class="mic-fab-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.55-.9l4.17 4.18L21 19.73 4.27 3z"/></svg>
    {/if}
  </button>
</div>

<style>
  .hud {
    /* Bottom layer offsets — single source of truth for stacking */
    --tabs-h: 0px;
    --console-h: 0px;
    --mic-gap: 0px; /* extra space reserved on mobile for mic FAB */
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

  .hud.has-tabs { --tabs-h: 44px; padding-bottom: 48px; }
  .hud.has-input { --console-h: 64px; }

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

  /* AI Thinking: pulsing cyan/purple glow */
  .hud.ai-thinking .edge-glow {
    opacity: 1;
    animation: glow-thinking 2s ease-in-out infinite;
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

  @keyframes glow-thinking {
    0%, 100% {
      box-shadow:
        inset 0 0 20px rgba(0, 212, 255, 0.1),
        inset 0 0 40px rgba(123, 97, 255, 0.06),
        0 0 10px rgba(0, 212, 255, 0.06);
    }
    50% {
      box-shadow:
        inset 0 0 35px rgba(0, 212, 255, 0.22),
        inset 0 0 60px rgba(123, 97, 255, 0.1),
        0 0 25px rgba(0, 212, 255, 0.12);
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
    /* Push reactor upward so it doesn't overlap with subtitle + tabs */
    margin-bottom: 15vh;
  }

  .hud-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    max-height: 55vh;
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
  .hud-subtitle-overlay.has-tabs { bottom: calc(var(--tabs-h) + 12px); }
  .hud-subtitle-overlay.has-input { bottom: calc(var(--tabs-h) + var(--console-h) + 16px); }
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
      max-height: 45vh;
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

  /* === Persistent Floating Mic FAB === */
  .mic-fab {
    position: fixed;
    bottom: calc(var(--tabs-h) + 24px);
    right: 24px;
    z-index: 9999;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 2px solid rgba(100, 100, 120, 0.5);
    background: rgba(30, 30, 50, 0.92);
    color: rgba(200, 200, 220, 0.7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    transition: all 0.25s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  /* When console open on desktop, nudge mic up a touch above it visually */
  .hud.has-input .mic-fab { bottom: calc(var(--tabs-h) + var(--console-h) + 16px); }

  /* Voice capture scan frame around mic FAB */
  .mic-frame {
    position: absolute;
    inset: -12px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .mic-fab.mic-on .mic-frame { opacity: 0.6; }
  .mic-fab.mic-capturing .mic-frame { opacity: 1; }
  .mf {
    position: absolute;
    width: 16px;
    height: 16px;
    border-color: var(--accent);
    filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.8));
  }
  .mf.c1 { top: 0; left: 0; border-top: 2px solid; border-left: 2px solid; }
  .mf.c2 { top: 0; right: 0; border-top: 2px solid; border-right: 2px solid; }
  .mf.c3 { bottom: 0; left: 0; border-bottom: 2px solid; border-left: 2px solid; }
  .mf.c4 { bottom: 0; right: 0; border-bottom: 2px solid; border-right: 2px solid; }
  .mf-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px solid rgba(0, 212, 255, 0.4);
    animation: micRing 2s ease-out infinite;
  }
  .mic-fab.mic-capturing .mf,
  .mic-fab.mic-capturing .mf-ring {
    border-color: var(--purple);
    filter: drop-shadow(0 0 8px rgba(123, 97, 255, 0.9));
    animation: micRing 1.1s ease-out infinite;
  }
  @keyframes micRing {
    0%   { transform: scale(0.85); opacity: 0.9; }
    100% { transform: scale(1.35); opacity: 0; }
  }

  .mic-fab:active {
    transform: scale(0.92);
  }

  .mic-fab.mic-on {
    border-color: rgba(0, 212, 255, 0.7);
    background: rgba(0, 30, 50, 0.92);
    color: #00d4ff;
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.3), 0 4px 20px rgba(0, 0, 0, 0.4);
    animation: mic-fab-pulse 2s ease-in-out infinite;
  }

  .mic-fab.mic-paused {
    border-color: rgba(255, 85, 119, 0.5);
    color: rgba(255, 85, 119, 0.8);
  }

  .mic-fab-icon {
    width: 28px;
    height: 28px;
  }

  @keyframes mic-fab-pulse {
    0%, 100% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.3), 0 4px 20px rgba(0, 0, 0, 0.4); }
    50% { box-shadow: 0 0 35px rgba(0, 212, 255, 0.5), 0 4px 20px rgba(0, 0, 0, 0.4); }
  }

  @media (max-width: 600px) {
    .mic-fab {
      width: 52px;
      height: 52px;
      bottom: calc(var(--tabs-h) + var(--console-h) + 16px);
      right: 14px;
    }
    .mic-fab-icon {
      width: 22px;
      height: 22px;
    }
    /* On mobile when input visible, mic moves to LEFT to free center for input — avoids overlap */
    .hud.has-input .mic-fab {
      right: auto;
      left: 14px;
      bottom: calc(var(--tabs-h) + var(--console-h) + 16px);
    }
  }

  /* === Sci-fi Command Console (text input) === */
  .cmd-console {
    position: fixed;
    bottom: calc(var(--tabs-h) + 16px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 12px;
    width: calc(100% - 32px);
    max-width: 720px;
    padding: 10px 14px 10px 18px;
    /* Angular hexagonal-ish frame */
    clip-path: polygon(
      14px 0,
      calc(100% - 14px) 0,
      100% 50%,
      calc(100% - 14px) 100%,
      14px 100%,
      0 50%
    );
    background:
      linear-gradient(135deg, rgba(2, 14, 28, 0.92) 0%, rgba(8, 4, 20, 0.94) 100%);
    border: 1px solid rgba(0, 212, 255, 0.4);
    box-shadow:
      0 0 0 1px rgba(0, 212, 255, 0.08),
      0 8px 36px rgba(0, 212, 255, 0.22),
      0 0 80px rgba(0, 212, 255, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(16px) saturate(1.5);
    -webkit-backdrop-filter: blur(16px) saturate(1.5);
    transition: box-shadow 0.3s ease, transform 0.3s ease;
    animation: consoleIn 0.35s cubic-bezier(0.2, 0.9, 0.3, 1.2);
    overflow: hidden;
    isolation: isolate;
  }
  .cmd-console.has-tabs { bottom: calc(var(--tabs-h) + 16px); }

  /* === Capture frame (corner brackets that pulse when typing or voice listening) === */
  .cc-capture-frame {
    position: absolute;
    inset: -10px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: -1;
  }
  .cmd-console.capturing .cc-capture-frame,
  .cmd-console.listening .cc-capture-frame,
  .cmd-console:focus-within .cc-capture-frame { opacity: 1; }

  .ccf {
    position: absolute;
    width: 22px;
    height: 22px;
    border-color: var(--accent);
    filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.7));
    animation: capturePulse 1.4s ease-in-out infinite;
  }
  .ccf.c1 { top: 0; left: 0; border-top: 2px solid; border-left: 2px solid; }
  .ccf.c2 { top: 0; right: 0; border-top: 2px solid; border-right: 2px solid; animation-delay: 0.15s; }
  .ccf.c3 { bottom: 0; left: 0; border-bottom: 2px solid; border-left: 2px solid; animation-delay: 0.3s; }
  .ccf.c4 { bottom: 0; right: 0; border-bottom: 2px solid; border-right: 2px solid; animation-delay: 0.45s; }
  .cmd-console.listening .ccf {
    border-color: var(--purple);
    filter: drop-shadow(0 0 8px rgba(123, 97, 255, 0.8));
    animation-duration: 0.8s;
  }
  @keyframes capturePulse {
    0%, 100% { transform: scale(1); opacity: 0.5; }
    50%      { transform: scale(1.04); opacity: 1; }
  }

  /* Animated scanning rail along the top edge */
  .cc-rail {
    position: absolute;
    top: 0;
    left: 0;
    height: 2px;
    width: 60px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
    animation: railSweep 3.2s linear infinite;
    pointer-events: none;
    opacity: 0.85;
  }

  /* Corner brackets */
  .cmd-console .cc-bracket {
    position: absolute;
    width: 10px;
    height: 10px;
    border-color: var(--accent);
    pointer-events: none;
    opacity: 0.85;
  }
  .cmd-console .cc-bracket.tl { top: 4px; left: 18px; border-top: 1.5px solid; border-left: 1.5px solid; }
  .cmd-console .cc-bracket.tr { top: 4px; right: 18px; border-top: 1.5px solid; border-right: 1.5px solid; }
  .cmd-console .cc-bracket.bl { bottom: 4px; left: 18px; border-bottom: 1.5px solid; border-left: 1.5px solid; }
  .cmd-console .cc-bracket.br { bottom: 4px; right: 18px; border-bottom: 1.5px solid; border-right: 1.5px solid; }

  .cc-prefix {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
    flex-shrink: 0;
    user-select: none;
  }
  .cc-chevron {
    color: var(--accent);
    font-weight: 700;
    text-shadow: 0 0 8px var(--accent);
    animation: chevPulse 1.6s ease-in-out infinite;
  }
  .cc-label {
    color: var(--accent);
    font-weight: 600;
  }
  .cc-target {
    color: rgba(220, 240, 255, 0.7);
  }
  .cc-divider {
    color: rgba(0, 212, 255, 0.35);
    font-weight: 300;
  }

  .cmd-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: rgba(220, 240, 255, 0.98);
    font-family: var(--font-mono);
    font-size: 0.95rem;
    letter-spacing: 0.02em;
    padding: 6px 4px;
    caret-color: var(--accent);
    text-shadow: 0 0 8px rgba(0, 212, 255, 0.3);
    min-width: 0;
  }
  .cmd-input::placeholder {
    color: rgba(120, 160, 200, 0.45);
    font-style: normal;
    font-family: var(--font);
    letter-spacing: 0.04em;
  }

  /* Focus glow */
  .cmd-console:focus-within {
    border-color: rgba(0, 212, 255, 0.7);
    box-shadow:
      0 0 0 1px rgba(0, 212, 255, 0.18),
      0 8px 50px rgba(0, 212, 255, 0.4),
      0 0 120px rgba(0, 212, 255, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .cc-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    color: rgba(180, 210, 240, 0.55);
    flex-shrink: 0;
    user-select: none;
  }
  .cc-count {
    color: var(--accent);
    min-width: 28px;
    text-align: right;
  }
  .cc-hint {
    color: rgba(180, 210, 240, 0.55);
  }

  .cc-send {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    background: linear-gradient(135deg, rgba(0, 212, 255, 0.18), rgba(0, 212, 255, 0.06));
    border: 1px solid rgba(0, 212, 255, 0.5);
    clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
    cursor: pointer;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }
  .cc-send svg { width: 18px; height: 18px; }
  .cc-send:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(0, 212, 255, 0.36), rgba(0, 212, 255, 0.14));
    box-shadow: 0 0 18px rgba(0, 212, 255, 0.5), inset 0 0 12px rgba(0, 212, 255, 0.2);
    transform: translateX(2px);
  }
  .cc-send:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  @keyframes consoleIn {
    from { opacity: 0; transform: translate(-50%, 12px) scale(0.96); filter: blur(4px); }
    to   { opacity: 1; transform: translate(-50%, 0) scale(1); filter: blur(0); }
  }
  @keyframes railSweep {
    0%   { left: -60px; opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { left: 100%; opacity: 0; }
  }
  @keyframes chevPulse {
    0%, 100% { opacity: 1; text-shadow: 0 0 8px var(--accent); }
    50%      { opacity: 0.55; text-shadow: 0 0 16px var(--accent); }
  }

  @media (max-width: 600px) {
    .cmd-console {
      padding: 8px 10px 8px 14px;
      gap: 8px;
    }
    .cc-prefix { font-size: 0.62rem; gap: 4px; }
    .cc-target { display: none; }
    .cc-meta { display: none; }
    .cmd-input { font-size: 0.88rem; }
    .cc-send { width: 32px; height: 32px; }
    .cc-send svg { width: 16px; height: 16px; }
  }
</style>
