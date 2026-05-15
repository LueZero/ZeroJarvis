<script lang="ts">
  /**
   * Full-screen NotebookLM content overlay — Sci-fi HUD style
   * Triggered by [ACTION:NOTEBOOK:json] from AI
   * Supports: markdown, mindmap, quiz, flashcards, media, table
   * Voice + touch interactive mode for quiz, flashcards, mindmap
   */
  import type { NotebookContent } from "@zerojarvis/shared";

  interface Props {
    content: NotebookContent;
    onClose: () => void;
    onVoiceCommand?: (cmd: any) => void;
  }

  let { content, onClose }: Props = $props();

  // --- Quiz State ---
  let selectedAnswers = $state<Record<number, number>>({});
  let currentQuestion = $state(0);

  function selectAnswer(qIdx: number, optIdx: number) {
    if (selectedAnswers[qIdx] !== undefined) return; // already answered
    selectedAnswers = { ...selectedAnswers, [qIdx]: optIdx };
  }

  type QuizQuestion = { question: string; options: string[]; correct: number; rationale?: string };

  /** Strip LaTeX markup from NotebookLM content: $...$ delimiters, \frac{a}{b}, \Omega, etc. */
  function stripLatex(s: string): string {
    if (!s) return s;
    return s
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1/$2")
      .replace(/\\eta/g, "η")
      .replace(/\\rho/g, "ρ")
      .replace(/\\ell/g, "ℓ")
      .replace(/\\Omega/g, "Ω")
      .replace(/\\%/g, "%")
      .replace(/\$/g, "");
  }

  function quizQuestions(): QuizQuestion[] | null {
    if (content.type !== "quiz") return null;
    const raw = parseJson(content.data);
    if (!raw) return null;

    // Normalize: support both overlay format and NotebookLM native format
    const arr = Array.isArray(raw) ? raw : (raw as any).questions ?? (raw as any).data;
    if (!Array.isArray(arr)) return null;

    return arr.map((q: any) => {
      // Already in overlay format: {question, options: string[], correct: number}
      if (Array.isArray(q.options) && typeof q.correct === "number") {
        return {
          ...q,
          question: stripLatex(q.question),
          options: q.options.map((o: string) => stripLatex(o)),
          rationale: q.rationale ? stripLatex(q.rationale) : q.rationale,
        };
      }

      // NotebookLM format: {question, answerOptions: [{text, isCorrect, rationale}]}
      if (Array.isArray(q.answerOptions)) {
        const options = q.answerOptions.map((o: any) => stripLatex(o.text ?? o));
        const correctIdx = q.answerOptions.findIndex((o: any) => o.isCorrect);
        const correctOpt = q.answerOptions.find((o: any) => o.isCorrect);
        return {
          question: stripLatex(q.question),
          options,
          correct: correctIdx >= 0 ? correctIdx : 0,
          rationale: stripLatex(correctOpt?.rationale ?? q.hint ?? q.rationale),
        };
      }

      return q; // best-effort passthrough
    });
  }

  function quizScore(): { answered: number; correct: number; total: number } {
    const qs = quizQuestions();
    if (!qs) return { answered: 0, correct: 0, total: 0 };
    const answered = Object.keys(selectedAnswers).length;
    const correct = Object.entries(selectedAnswers).filter(([qIdx, optIdx]) => qs[Number(qIdx)]?.correct === optIdx).length;
    return { answered, correct, total: qs.length };
  }

  function scrollToQuestion(idx: number) {
    const el = document.querySelector(`[data-quiz-idx="${idx}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // --- Flashcard State ---
  let flippedCards = $state<Set<number>>(new Set());
  let currentCard = $state(0);

  function flipCard(idx: number) {
    const next = new Set(flippedCards);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    flippedCards = next;
  }

  function flashcardItems(): { front: string; back: string }[] | null {
    if (content.type !== "flashcards") return null;
    const raw = parseJson(content.data);
    if (!raw) return null;
    // Support both [{front,back}] array and {cards: [{front,back}]} wrapper
    if (Array.isArray(raw)) return raw;
    if ((raw as any).cards && Array.isArray((raw as any).cards)) return (raw as any).cards;
    return null;
  }

  // --- Public: handle voice command from HUD ---
  export function handleVoiceCommand(cmd: { cmd: string; value?: number }) {
    switch (cmd.cmd) {
      // Quiz
      case "answer": {
        const qs = quizQuestions();
        if (qs && cmd.value !== undefined && currentQuestion < qs.length) {
          selectAnswer(currentQuestion, cmd.value);
        }
        break;
      }
      case "next": {
        if (content.type === "quiz") {
          const qs = quizQuestions();
          if (qs && currentQuestion < qs.length - 1) {
            currentQuestion++;
            scrollToQuestion(currentQuestion);
          }
        } else if (content.type === "flashcards") {
          const cards = flashcardItems();
          if (cards && currentCard < cards.length - 1) {
            currentCard++;
          }
        }
        break;
      }
      case "prev": {
        if (content.type === "quiz") {
          if (currentQuestion > 0) {
            currentQuestion--;
            scrollToQuestion(currentQuestion);
          }
        } else if (content.type === "flashcards") {
          if (currentCard > 0) {
            currentCard--;
          }
        }
        break;
      }
      case "flip": {
        if (content.type === "flashcards") {
          flipCard(currentCard);
        }
        break;
      }
      case "reset": {
        if (content.type === "quiz") {
          selectedAnswers = {};
          currentQuestion = 0;
          scrollToQuestion(0);
        }
        break;
      }
      case "close": {
        onClose();
        break;
      }
      case "expand": {
        if (content.type === "mindmap") {
          document.querySelectorAll('.mindmap-content details').forEach(d => (d as HTMLDetailsElement).open = true);
        }
        break;
      }
      case "collapse": {
        if (content.type === "mindmap") {
          document.querySelectorAll('.mindmap-content details').forEach(d => (d as HTMLDetailsElement).open = false);
        }
        break;
      }
      case "scroll_down": {
        const scrollEl = document.querySelector('.content-scroll');
        scrollEl?.scrollBy({ top: 300, behavior: 'smooth' });
        break;
      }
      case "scroll_up": {
        const scrollEl = document.querySelector('.content-scroll');
        scrollEl?.scrollBy({ top: -300, behavior: 'smooth' });
        break;
      }
    }
  }

  // --- Markdown rendering (lightweight) ---
  function renderMarkdown(md: string | unknown): string {
    const s = typeof md === "string" ? md : JSON.stringify(md, null, 2);
    return s
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
  function parseJson(data: string | unknown): unknown {
    if (typeof data !== "string") return data; // already parsed (LLM may send object directly)
    try { return JSON.parse(data); }
    catch { return null; }
  }

  function parseCsv(data: string | unknown): string[][] {
    const s = typeof data === "string" ? data : String(data);
    return s.trim().split('\n').map(row => row.split(',').map(c => c.trim()));
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

  // --- Voice hint per type ---
  function voiceHints(): string {
    switch (content.type) {
      case "quiz": return "語音：答A/B/C/D · 下一題 · 上一題 · 重新開始 · 關閉";
      case "flashcards": return "語音：翻轉 · 下一張 · 上一張 · 關閉";
      case "mindmap": return "語音：展開 · 收合 · 關閉";
      default: return "語音：往上 · 往下 · 關閉";
    }
  }

  // --- Keyboard close ---
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    // Keyboard shortcuts for quiz/flashcards
    if (content.type === "quiz") {
      if (e.key >= "1" && e.key <= "4") {
        const qs = quizQuestions();
        if (qs && currentQuestion < qs.length) {
          selectAnswer(currentQuestion, Number(e.key) - 1);
        }
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") handleVoiceCommand({ cmd: "next" });
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") handleVoiceCommand({ cmd: "prev" });
    }
    if (content.type === "flashcards") {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleVoiceCommand({ cmd: "flip" }); }
      if (e.key === "ArrowRight") handleVoiceCommand({ cmd: "next" });
      if (e.key === "ArrowLeft") handleVoiceCommand({ cmd: "prev" });
    }
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
            <div class="mm-controls">
              <button class="mm-ctrl-btn" onclick={() => handleVoiceCommand({ cmd: "expand" })}>⊞ 展開全部</button>
              <button class="mm-ctrl-btn" onclick={() => handleVoiceCommand({ cmd: "collapse" })}>⊟ 收合全部</button>
            </div>
            {@render mindmapNode(tree as {label: string; children?: unknown[]})}
          {:else}
            <p class="error-text">無法解析心智圖資料</p>
          {/if}
        </div>
      </div>

    {:else if content.type === "quiz"}
      {@const questions = quizQuestions()}
      <div class="content-scroll">
        <div class="quiz-content">
          {#if questions}
            <!-- Quiz progress bar -->
            <div class="quiz-progress">
              <div class="quiz-progress-bar">
                <div class="quiz-progress-fill" style="width: {Math.round(quizScore().answered / quizScore().total * 100)}%"></div>
              </div>
              <div class="quiz-progress-text">
                <span>第 {currentQuestion + 1}/{questions.length} 題</span>
                <span>答對 {quizScore().correct}/{quizScore().answered}</span>
              </div>
            </div>
            <!-- Quiz navigation buttons -->
            <div class="quiz-nav">
              <button class="quiz-nav-btn" disabled={currentQuestion === 0} onclick={() => handleVoiceCommand({ cmd: "prev" })}>◀ 上一題</button>
              <button class="quiz-nav-btn" disabled={currentQuestion >= questions.length - 1} onclick={() => handleVoiceCommand({ cmd: "next" })}>下一題 ▶</button>
              <button class="quiz-nav-btn reset" onclick={() => handleVoiceCommand({ cmd: "reset" })}>↻ 重新開始</button>
            </div>
            {#each questions as q, qIdx}
              <div class="quiz-card" class:quiz-current={qIdx === currentQuestion} data-quiz-idx={qIdx} onclick={() => { currentQuestion = qIdx; }}>
                <div class="quiz-question">{qIdx + 1}. {q.question}</div>
                <div class="quiz-options">
                  {#each q.options as opt, oIdx}
                    <button
                      class="quiz-option"
                      class:selected={selectedAnswers[qIdx] === oIdx}
                      class:correct={selectedAnswers[qIdx] !== undefined && oIdx === q.correct}
                      class:wrong={selectedAnswers[qIdx] === oIdx && oIdx !== q.correct}
                      onclick={() => { currentQuestion = qIdx; selectAnswer(qIdx, oIdx); }}
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
            <!-- Final score display -->
            {#if quizScore().answered === quizScore().total && quizScore().total > 0}
              <div class="quiz-score-final">
                <div class="score-icon">{quizScore().correct === quizScore().total ? '🎉' : quizScore().correct >= quizScore().total * 0.7 ? '👍' : '📚'}</div>
                <div class="score-text">得分：{quizScore().correct} / {quizScore().total}</div>
                <div class="score-pct">{Math.round(quizScore().correct / quizScore().total * 100)}%</div>
              </div>
            {/if}
          {:else}
            <p class="error-text">無法解析測驗資料</p>
          {/if}
        </div>
      </div>

    {:else if content.type === "flashcards"}
      {@const cards = flashcardItems()}
      <div class="content-scroll">
        <div class="flashcards-content">
          {#if cards}
            <!-- Flashcard navigation + counter -->
            <div class="fc-nav">
              <button class="fc-nav-btn" disabled={currentCard === 0} onclick={() => handleVoiceCommand({ cmd: "prev" })}>◀ 上一張</button>
              <span class="fc-counter">{currentCard + 1} / {cards.length}</span>
              <button class="fc-nav-btn" disabled={currentCard >= cards.length - 1} onclick={() => handleVoiceCommand({ cmd: "next" })}>下一張 ▶</button>
            </div>
            <!-- Focused card (large) -->
            <div class="fc-focus-area">
              <button class="flashcard flashcard-focus" class:flipped={flippedCards.has(currentCard)} onclick={() => flipCard(currentCard)}>
                <div class="flashcard-inner">
                  <div class="flashcard-front">
                    <span class="fc-label">問題</span>
                    {cards[currentCard].front}
                  </div>
                  <div class="flashcard-back">
                    <span class="fc-label">答案</span>
                    {cards[currentCard].back}
                  </div>
                </div>
              </button>
              <div class="fc-tip">點擊卡片翻轉 · 空白鍵翻轉 · ← → 切換</div>
            </div>
            <!-- Mini grid (all cards) -->
            <div class="fc-mini-grid">
              {#each cards as card, idx}
                <button
                  class="fc-mini"
                  class:fc-mini-active={idx === currentCard}
                  class:fc-mini-flipped={flippedCards.has(idx)}
                  onclick={() => { currentCard = idx; }}
                >
                  {idx + 1}
                </button>
              {/each}
            </div>
          {:else}
            <p class="error-text">無法解析學習卡資料</p>
          {/if}
        </div>
      </div>

    {:else if content.type === "media"}
      {@const filePath = content.data.trim()}
      {@const isVideo = /\.(mp4|webm|mov)$/i.test(filePath)}
      {@const isAudio = /\.(mp3|wav|ogg|m4a)$/i.test(filePath)}
      {@const mediaUrl = filePath.startsWith("http") ? filePath : `/${filePath}`}
      <div class="content-scroll">
        <div class="media-content">
          {#if isVideo}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video class="media-player" controls autoplay src={mediaUrl}>
              <track kind="captions" />
            </video>
          {:else if isAudio}
            <audio class="media-player" controls autoplay src={mediaUrl}></audio>
          {:else}
            <div class="media-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="media-info">{content.data}</div>
          {/if}
          <div class="media-hint">{content.title}</div>
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
    <span class="hud-hint">{voiceHints()} · ESC 關閉</span>
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

  .mm-controls {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  .mm-ctrl-btn {
    padding: 6px 14px;
    border-radius: 6px;
    background: rgba(0, 212, 255, 0.08);
    border: 1px solid rgba(0, 212, 255, 0.25);
    color: rgba(0, 212, 255, 0.8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .mm-ctrl-btn:hover {
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
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
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .quiz-card.quiz-current {
    border-color: rgba(0, 212, 255, 0.5);
    box-shadow: 0 0 12px rgba(0, 212, 255, 0.15);
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

  /* Quiz progress bar */
  .quiz-progress {
    margin-bottom: 8px;
  }

  .quiz-progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
  }

  .quiz-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00d4ff, #00ff88);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .quiz-progress-text {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.45);
    margin-top: 6px;
    letter-spacing: 0.05em;
  }

  /* Quiz navigation */
  .quiz-nav {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
  }

  .quiz-nav-btn {
    padding: 6px 14px;
    border-radius: 6px;
    background: rgba(0, 212, 255, 0.08);
    border: 1px solid rgba(0, 212, 255, 0.25);
    color: rgba(0, 212, 255, 0.8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .quiz-nav-btn:hover:not(:disabled) {
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
  }

  .quiz-nav-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .quiz-nav-btn.reset {
    margin-left: auto;
    border-color: rgba(255, 85, 119, 0.25);
    color: rgba(255, 85, 119, 0.7);
    background: rgba(255, 85, 119, 0.05);
  }

  .quiz-nav-btn.reset:hover {
    background: rgba(255, 85, 119, 0.1);
    border-color: rgba(255, 85, 119, 0.5);
  }

  /* Quiz final score */
  .quiz-score-final {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px;
    background: rgba(0, 255, 136, 0.05);
    border: 1px solid rgba(0, 255, 136, 0.2);
    border-radius: 12px;
  }

  .score-icon {
    font-size: 2rem;
  }

  .score-text {
    color: rgba(255, 255, 255, 0.9);
    font-size: 1rem;
    font-weight: 500;
  }

  .score-pct {
    color: #00ff88;
    font-size: 1.5rem;
    font-weight: 700;
  }

  /* --- Flashcards --- */
  .flashcards-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Navigation bar */
  .fc-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .fc-nav-btn {
    padding: 6px 14px;
    border-radius: 6px;
    background: rgba(0, 212, 255, 0.08);
    border: 1px solid rgba(0, 212, 255, 0.25);
    color: rgba(0, 212, 255, 0.8);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .fc-nav-btn:hover:not(:disabled) {
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
  }

  .fc-nav-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .fc-counter {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    min-width: 60px;
    text-align: center;
  }

  /* Focused card area */
  .fc-focus-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .flashcard-focus {
    width: 100%;
    max-width: 500px;
    height: 280px;
  }

  .fc-tip {
    font-size: 0.65rem;
    color: rgba(255, 255, 255, 0.3);
    letter-spacing: 0.08em;
  }

  .fc-label {
    display: block;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    opacity: 0.5;
    margin-bottom: 8px;
  }

  /* Mini grid */
  .fc-mini-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: center;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .fc-mini {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fc-mini:hover {
    border-color: rgba(0, 212, 255, 0.4);
  }

  .fc-mini-active {
    border-color: rgba(0, 212, 255, 0.6);
    background: rgba(0, 212, 255, 0.1);
    color: #00d4ff;
  }

  .fc-mini-flipped {
    background: rgba(0, 255, 136, 0.1);
    border-color: rgba(0, 255, 136, 0.3);
    color: rgba(0, 255, 136, 0.8);
  }

  .flashcard {
    perspective: 1000px;
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
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    border-radius: 8px;
    backface-visibility: hidden;
    font-size: 0.95rem;
    line-height: 1.6;
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

  .media-player {
    width: 100%;
    max-width: 800px;
    max-height: 70vh;
    border-radius: 8px;
    outline: 1px solid rgba(0, 212, 255, 0.2);
  }

  audio.media-player {
    width: 100%;
    max-width: 500px;
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
