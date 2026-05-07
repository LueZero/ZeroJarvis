<script lang="ts">
  /**
   * Full-screen NotebookLM content overlay — Sci-fi HUD style
   * Triggered by [ACTION:NOTEBOOK:json] from AI
   * Supports: markdown, mindmap, quiz, flashcards, media, table
   */
  import type { NotebookContent } from "@zerojarvis/shared";

  interface Props {
    content: NotebookContent;
    onClose: () => void;
  }

  let { content, onClose }: Props = $props();

  // --- Quiz State ---
  let selectedAnswers = $state<Record<number, number>>({});

  function selectAnswer(qIdx: number, optIdx: number) {
    if (selectedAnswers[qIdx] !== undefined) return; // already answered
    selectedAnswers = { ...selectedAnswers, [qIdx]: optIdx };
  }

  // --- Flashcard State ---
  let flippedCards = $state<Set<number>>(new Set());

  function flipCard(idx: number) {
    const next = new Set(flippedCards);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    flippedCards = next;
  }

  // --- Markdown rendering (lightweight) ---
  function renderMarkdown(md: string): string {
    return md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');
  }

  // --- Parse helpers ---
  function parseJson(data: string): unknown {
    try { return JSON.parse(data); }
    catch { return null; }
  }

  function parseCsv(data: string): string[][] {
    return data.trim().split('\n').map(row => row.split(',').map(c => c.trim()));
  }

  // --- Badge label per type ---
  const typeLabels: Record<string, string> = {
    markdown: "REPORT",
    mindmap: "MIND MAP",
    quiz: "QUIZ",
    flashcards: "FLASHCARDS",
    media: "MEDIA",
    table: "DATA TABLE",
  };

  // --- Keyboard close ---
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="notebook-overlay" class:active={true}>
  <!-- Content body -->
  <div class="notebook-body">
    {#if content.type === "markdown"}
      <div class="content-scroll">
        <div class="markdown-content">
          {@html renderMarkdown(content.data)}
        </div>
      </div>

    {:else if content.type === "mindmap"}
      {@const tree = parseJson(content.data)}
      <div class="content-scroll">
        <div class="mindmap-content">
          {#if tree}
            {@render mindmapNode(tree as {label: string; children?: unknown[]})}
          {:else}
            <p class="error-text">無法解析心智圖資料</p>
          {/if}
        </div>
      </div>

    {:else if content.type === "quiz"}
      {@const questions = parseJson(content.data) as {question: string; options: string[]; correct: number; rationale?: string}[] | null}
      <div class="content-scroll">
        <div class="quiz-content">
          {#if questions}
            {#each questions as q, qIdx}
              <div class="quiz-card">
                <div class="quiz-question">{qIdx + 1}. {q.question}</div>
                <div class="quiz-options">
                  {#each q.options as opt, oIdx}
                    <button
                      class="quiz-option"
                      class:selected={selectedAnswers[qIdx] === oIdx}
                      class:correct={selectedAnswers[qIdx] !== undefined && oIdx === q.correct}
                      class:wrong={selectedAnswers[qIdx] === oIdx && oIdx !== q.correct}
                      onclick={() => selectAnswer(qIdx, oIdx)}
                    >
                      <span class="opt-letter">{String.fromCharCode(65 + oIdx)}</span>
                      <span class="opt-text">{opt}</span>
                    </button>
                  {/each}
                </div>
                {#if selectedAnswers[qIdx] !== undefined && q.rationale}
                  <div class="quiz-rationale">
                    <span class="rationale-label">解說：</span>{q.rationale}
                  </div>
                {/if}
              </div>
            {/each}
          {:else}
            <p class="error-text">無法解析測驗資料</p>
          {/if}
        </div>
      </div>

    {:else if content.type === "flashcards"}
      {@const cards = parseJson(content.data) as {front: string; back: string}[] | null}
      <div class="content-scroll">
        <div class="flashcards-content">
          {#if cards}
            {#each cards as card, idx}
              <button class="flashcard" class:flipped={flippedCards.has(idx)} onclick={() => flipCard(idx)}>
                <div class="flashcard-inner">
                  <div class="flashcard-front">{card.front}</div>
                  <div class="flashcard-back">{card.back}</div>
                </div>
              </button>
            {/each}
          {:else}
            <p class="error-text">無法解析閃卡資料</p>
          {/if}
        </div>
      </div>

    {:else if content.type === "media"}
      <div class="content-scroll">
        <div class="media-content">
          <div class="media-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="media-info">{content.data}</div>
          <div class="media-hint">檔案已產生完成</div>
        </div>
      </div>

    {:else if content.type === "table"}
      {@const rows = parseCsv(content.data)}
      <div class="content-scroll">
        <div class="table-content">
          {#if rows.length > 0}
            <table>
              <thead>
                <tr>
                  {#each rows[0] as header}
                    <th>{header}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each rows.slice(1) as row}
                  <tr>
                    {#each row as cell}
                      <td>{cell}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <!-- HUD Overlay elements -->
  <div class="scan-line"></div>
  <div class="vignette"></div>

  <!-- Corner brackets -->
  <div class="bracket tl"></div>
  <div class="bracket tr"></div>
  <div class="bracket bl"></div>
  <div class="bracket br"></div>

  <!-- Top HUD info -->
  <div class="hud-top">
    <div class="hud-top-left">
      <div class="loc-badge">
        <span class="loc-dot"></span>
        <span class="loc-text">{typeLabels[content.type] || "NOTEBOOK"}</span>
      </div>
      <span class="hud-data">{content.title}</span>
    </div>
    <div class="hud-top-right">
      <span class="hud-data">NOTEBOOKLM</span>
      <button class="close-btn" onclick={onClose}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- Side data strips -->
  <div class="hud-side left">
    <div class="data-bar"></div>
    <div class="data-bar short"></div>
    <div class="data-bar"></div>
  </div>
  <div class="hud-side right">
    <div class="data-bar"></div>
    <div class="data-bar short"></div>
    <div class="data-bar"></div>
  </div>

  <!-- Bottom hint -->
  <div class="hud-bottom">
    <span class="hud-hint">語音可下達新指令 · ESC 關閉</span>
  </div>
</div>

{#snippet mindmapNode(node: {label: string; children?: unknown[]})}
  <details open>
    <summary class="mm-node">{node.label}</summary>
    {#if node.children && node.children.length > 0}
      <div class="mm-children">
        {#each node.children as child}
          {@render mindmapNode(child as {label: string; children?: unknown[]})}
        {/each}
      </div>
    {/if}
  </details>
{/snippet}

<style>
  .notebook-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #0a0e14;
    transform: translateX(100%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
    overflow: hidden;
  }

  .notebook-overlay.active {
    transform: translateX(0);
    pointer-events: all;
  }

  /* Content body */
  .notebook-body {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .content-scroll {
    width: 100%;
    max-width: 860px;
    max-height: calc(100vh - 120px);
    margin: 60px auto;
    padding: 24px 32px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 212, 255, 0.3) transparent;
  }

  /* --- Markdown --- */
  .markdown-content {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.9rem;
    line-height: 1.7;
    letter-spacing: 0.02em;
  }

  .markdown-content :global(h1) {
    font-size: 1.5rem;
    color: #00d4ff;
    margin: 1.2em 0 0.5em;
    font-weight: 600;
  }

  .markdown-content :global(h2) {
    font-size: 1.2rem;
    color: rgba(0, 212, 255, 0.85);
    margin: 1em 0 0.4em;
    font-weight: 500;
  }

  .markdown-content :global(h3) {
    font-size: 1rem;
    color: rgba(0, 212, 255, 0.7);
    margin: 0.8em 0 0.3em;
    font-weight: 500;
  }

  .markdown-content :global(code) {
    background: rgba(0, 212, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.85em;
  }

  .markdown-content :global(ul) {
    padding-left: 1.5em;
    margin: 0.5em 0;
  }

  .markdown-content :global(li) {
    margin: 0.3em 0;
  }

  .markdown-content :global(strong) {
    color: #fff;
  }

  /* --- Mind Map --- */
  .mindmap-content {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.85rem;
  }

  .mindmap-content :global(details) {
    margin-left: 1.2em;
    border-left: 1px solid rgba(0, 212, 255, 0.2);
    padding-left: 12px;
    margin-top: 4px;
  }

  .mindmap-content :global(details > details) {
    margin-top: 2px;
  }

  :global(.mm-node) {
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 4px;
    background: rgba(0, 212, 255, 0.08);
    border: 1px solid rgba(0, 212, 255, 0.2);
    display: inline-block;
    margin: 2px 0;
    transition: background 0.2s;
  }

  :global(.mm-node:hover) {
    background: rgba(0, 212, 255, 0.15);
  }

  .mm-children {
    padding-top: 4px;
  }

  /* --- Quiz --- */
  .quiz-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .quiz-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(0, 212, 255, 0.15);
    border-radius: 8px;
    padding: 20px;
  }

  .quiz-question {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
    margin-bottom: 12px;
    line-height: 1.5;
  }

  .quiz-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .quiz-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.75);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    font-size: 0.85rem;
  }

  .quiz-option:hover:not(.correct):not(.wrong) {
    border-color: rgba(0, 212, 255, 0.4);
    background: rgba(0, 212, 255, 0.05);
  }

  .quiz-option.correct {
    border-color: rgba(0, 255, 136, 0.6);
    background: rgba(0, 255, 136, 0.1);
    color: #00ff88;
  }

  .quiz-option.wrong {
    border-color: rgba(255, 85, 119, 0.6);
    background: rgba(255, 85, 119, 0.1);
    color: #ff5577;
  }

  .opt-letter {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 212, 255, 0.15);
    font-size: 0.75rem;
    font-weight: 600;
    color: #00d4ff;
    flex-shrink: 0;
  }

  .opt-text {
    flex: 1;
  }

  .quiz-rationale {
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 6px;
    background: rgba(0, 212, 255, 0.05);
    border: 1px solid rgba(0, 212, 255, 0.15);
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .rationale-label {
    color: #00d4ff;
    font-weight: 500;
  }

  /* --- Flashcards --- */
  .flashcards-content {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
  }

  .flashcard {
    perspective: 1000px;
    height: 180px;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
  }

  .flashcard-inner {
    position: relative;
    width: 100%;
    height: 100%;
    transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    transform-style: preserve-3d;
  }

  .flashcard.flipped .flashcard-inner {
    transform: rotateY(180deg);
  }

  .flashcard-front,
  .flashcard-back {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    border-radius: 8px;
    backface-visibility: hidden;
    font-size: 0.85rem;
    line-height: 1.5;
    text-align: center;
  }

  .flashcard-front {
    background: rgba(0, 212, 255, 0.08);
    border: 1px solid rgba(0, 212, 255, 0.25);
    color: rgba(255, 255, 255, 0.9);
  }

  .flashcard-back {
    background: rgba(0, 255, 136, 0.08);
    border: 1px solid rgba(0, 255, 136, 0.25);
    color: rgba(0, 255, 136, 0.9);
    transform: rotateY(180deg);
  }

  /* --- Media --- */
  .media-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    color: rgba(0, 212, 255, 0.6);
    min-height: 300px;
  }

  .media-icon {
    opacity: 0.5;
  }

  .media-info {
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.9rem;
    text-align: center;
    max-width: 400px;
  }

  .media-hint {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 0.1em;
  }

  /* --- Table --- */
  .table-content {
    overflow-x: auto;
  }

  .table-content table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }

  .table-content th {
    background: rgba(0, 212, 255, 0.1);
    color: #00d4ff;
    padding: 10px 14px;
    text-align: left;
    font-weight: 500;
    border-bottom: 1px solid rgba(0, 212, 255, 0.3);
    white-space: nowrap;
  }

  .table-content td {
    padding: 8px 14px;
    color: rgba(255, 255, 255, 0.75);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .table-content tr:hover td {
    background: rgba(0, 212, 255, 0.03);
  }

  /* --- Error --- */
  .error-text {
    color: rgba(255, 85, 119, 0.8);
    font-size: 0.85rem;
    text-align: center;
    padding: 40px;
  }

  /* --- HUD Elements (same as MapOverlay) --- */
  .scan-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent 0%, rgba(0, 212, 255, 0.4) 50%, transparent 100%);
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.3);
    animation: scanMove 5s linear infinite;
    z-index: 10;
    pointer-events: none;
  }

  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.5) 100%);
    pointer-events: none;
    z-index: 5;
  }

  .bracket {
    position: absolute;
    width: 40px;
    height: 40px;
    z-index: 15;
    pointer-events: none;
  }

  .bracket::before,
  .bracket::after {
    content: '';
    position: absolute;
    background: rgba(0, 212, 255, 0.6);
    box-shadow: 0 0 6px rgba(0, 212, 255, 0.3);
  }

  .bracket::before { width: 100%; height: 1.5px; }
  .bracket::after { width: 1.5px; height: 100%; }

  .bracket.tl { top: 20px; left: 20px; }
  .bracket.tl::before { top: 0; left: 0; }
  .bracket.tl::after { top: 0; left: 0; }

  .bracket.tr { top: 20px; right: 20px; }
  .bracket.tr::before { top: 0; right: 0; }
  .bracket.tr::after { top: 0; right: 0; }

  .bracket.bl { bottom: 20px; left: 20px; }
  .bracket.bl::before { bottom: 0; left: 0; }
  .bracket.bl::after { bottom: 0; left: 0; }

  .bracket.br { bottom: 20px; right: 20px; }
  .bracket.br::before { bottom: 0; right: 0; }
  .bracket.br::after { bottom: 0; right: 0; }

  .hud-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
    z-index: 20;
    pointer-events: none;
  }

  .hud-top-left,
  .hud-top-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .loc-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(0, 212, 255, 0.12);
    border: 1px solid rgba(0, 212, 255, 0.3);
  }

  .loc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #00d4ff;
    box-shadow: 0 0 8px #00d4ff;
    animation: pulse 1.5s infinite;
  }

  .loc-text {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #00d4ff;
  }

  .hud-data {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.5);
    letter-spacing: 0.08em;
    font-weight: 300;
  }

  .close-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(0, 212, 255, 0.2);
    color: rgba(255, 255, 255, 0.6);
    transition: all 0.2s;
    pointer-events: all;
    cursor: pointer;
  }

  .close-btn:hover {
    background: rgba(255, 85, 119, 0.2);
    border-color: rgba(255, 85, 119, 0.5);
    color: #ff5577;
  }

  .hud-side {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 15;
    pointer-events: none;
  }

  .hud-side.left { left: 12px; }
  .hud-side.right { right: 12px; }

  .data-bar {
    width: 3px;
    height: 20px;
    background: rgba(0, 212, 255, 0.3);
    border-radius: 2px;
    animation: flicker 2s infinite alternate;
  }

  .data-bar.short {
    height: 12px;
    opacity: 0.5;
  }

  .hud-bottom {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    padding: 16px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, transparent 100%);
    z-index: 20;
    pointer-events: none;
  }

  .hud-hint {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 0.1em;
  }

  /* Animations */
  @keyframes scanMove {
    0% { top: -2px; }
    100% { top: 100%; }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  @keyframes flicker {
    0% { opacity: 0.3; }
    50% { opacity: 0.7; }
    100% { opacity: 0.3; }
  }
</style>
