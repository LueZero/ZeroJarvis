<script lang="ts">
  /**
   * Confirmation panel — shows polished text for user to confirm/edit/redo
   */
  import { getPolish } from "$lib/stores/agent.svelte";

  interface Props {
    onConfirm: (text: string) => void;
    onRedo: () => void;
    onCancel: () => void;
  }

  let { onConfirm, onRedo, onCancel }: Props = $props();

  let editMode = $state(false);
  let editText = $state("");

  $effect(() => {
    const polish = getPolish();
    if (polish) {
      editText = polish.polished;
    }
  });

  function handleConfirm() {
    onConfirm(editText);
    editMode = false;
  }
</script>

{#if getPolish()}
  <div class="confirm-panel">
    <div class="header">
      <span class="raw-label">🎤 原始</span>
      <span class="raw-text">{getPolish()?.raw}</span>
    </div>

    <div class="polished-section">
      <span class="polish-label">✨ 整理後</span>
      {#if editMode}
        <textarea bind:value={editText} class="edit-area" rows="3"></textarea>
      {:else}
        <div class="polish-text">{getPolish()?.polished}</div>
      {/if}

      {#if getPolish()?.corrections && getPolish()!.corrections.length > 0}
        <div class="corrections">
          {#each getPolish()!.corrections as correction}
            <span class="correction-tag">{correction}</span>
          {/each}
        </div>
      {/if}
    </div>

    <div class="confidence">
      信心度：{Math.round((getPolish()?.confidence || 0) * 100)}%
    </div>

    <div class="actions">
      <button class="btn btn-confirm" onclick={handleConfirm}>✅ 送出</button>
      <button class="btn btn-edit" onclick={() => (editMode = !editMode)}>
        ✏️ {editMode ? "預覽" : "修改"}
      </button>
      <button class="btn btn-redo" onclick={onRedo}>🎤 重講</button>
      <button class="btn btn-cancel" onclick={onCancel}>❌ 取消</button>
    </div>
  </div>
{/if}

<style>
  .confirm-panel {
    width: 100%;
    max-width: 500px;
    background: var(--bg-panel);
    border: 1px solid var(--accent-dim);
    border-radius: var(--radius);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: slideUp 0.3s ease;
  }

  .header {
    display: flex;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--text-dim);
  }

  .raw-label {
    flex-shrink: 0;
  }

  .raw-text {
    opacity: 0.6;
  }

  .polished-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .polish-label {
    font-size: 0.85rem;
    color: var(--accent);
  }

  .polish-text {
    font-size: 1rem;
    line-height: 1.6;
    padding: 10px;
    background: rgba(0, 212, 255, 0.05);
    border-radius: 8px;
    white-space: pre-wrap;
  }

  .edit-area {
    width: 100%;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--accent-dim);
    border-radius: 8px;
    color: var(--text);
    font: inherit;
    resize: vertical;
  }

  .corrections {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .correction-tag {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: rgba(255, 170, 68, 0.15);
    border-radius: 4px;
    color: var(--warning);
  }

  .confidence {
    font-size: 0.8rem;
    color: var(--text-dim);
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 0.9rem;
    transition: background 0.2s;
  }

  .btn-confirm {
    background: rgba(68, 255, 136, 0.15);
    color: var(--success);
  }
  .btn-confirm:hover { background: rgba(68, 255, 136, 0.25); }

  .btn-edit {
    background: rgba(0, 212, 255, 0.1);
    color: var(--accent);
  }
  .btn-edit:hover { background: rgba(0, 212, 255, 0.2); }

  .btn-redo {
    background: rgba(255, 170, 68, 0.1);
    color: var(--warning);
  }
  .btn-redo:hover { background: rgba(255, 170, 68, 0.2); }

  .btn-cancel {
    background: rgba(255, 68, 102, 0.1);
    color: var(--danger);
  }
  .btn-cancel:hover { background: rgba(255, 68, 102, 0.2); }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
