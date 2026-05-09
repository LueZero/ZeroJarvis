<script lang="ts">
  /**
   * OpenTable booking results overlay panel
   * Shows available reservation time slots from OpenTable search
   */
  import type { OpenTableResult } from "@zerojarvis/shared";

  interface Props {
    data: OpenTableResult;
    onClose: () => void;
  }

  let { data, onClose }: Props = $props();
</script>

<div class="booking-panel">
  <div class="booking-header">
    <div class="booking-title">
      <span class="ot-badge">OpenTable</span>
      <span class="booking-restaurant">{data.restaurant}</span>
    </div>
    <button class="booking-close" onclick={onClose}>✕</button>
  </div>

  <div class="booking-meta">
    <span class="meta-item">📅 {data.date}</span>
    <span class="meta-item">🕐 {data.time}</span>
    <span class="meta-item">👥 {data.partySize} 位</span>
  </div>

  {#if !data.found}
    <div class="booking-empty">
      <p>OpenTable 上未找到「{data.restaurant}」</p>
      <p class="booking-hint">可能此餐廳不在 OpenTable 上，建議直接電話訂位</p>
      {#if data.searchUrl}
        <a class="ot-link" href={data.searchUrl} target="_blank" rel="noopener noreferrer">
          在 OpenTable 手動搜尋 ↗
        </a>
      {/if}
    </div>
  {:else}
    <div class="booking-results">
      {#each data.results as rest}
        <div class="booking-card">
          <div class="card-header">
            <span class="card-name">{rest.name}</span>
            {#if rest.rating}
              <span class="card-rating">★ {rest.rating}</span>
            {/if}
          </div>
          {#if rest.meta}
            <div class="card-meta">{rest.meta}</div>
          {/if}

          {#if rest.slots.length > 0}
            <div class="slot-list">
              {#each rest.slots as slot}
                {#if slot.bookingUrl}
                  <a class="slot-btn" href={slot.bookingUrl} target="_blank" rel="noopener noreferrer">
                    {slot.time}
                  </a>
                {:else}
                  <span class="slot-btn disabled">{slot.time}</span>
                {/if}
              {/each}
            </div>
          {/if}

          {#if rest.pageUrl}
            <a class="booking-action-btn" href={rest.pageUrl} target="_blank" rel="noopener noreferrer">
              🔗 開啟 OpenTable 搜尋 & 訂位
            </a>
          {/if}
        </div>
      {/each}
    </div>

    {#if data.searchUrl}
      <a class="ot-link bottom" href={data.searchUrl} target="_blank" rel="noopener noreferrer">
        在 OpenTable 查看更多 ↗
      </a>
    {/if}
  {/if}
</div>

<style>
  .booking-panel {
    position: fixed;
    bottom: 80px;
    right: 24px;
    width: 360px;
    max-height: 60vh;
    background: rgba(0, 10, 20, 0.92);
    border: 1px solid rgba(218, 55, 67, 0.4);
    border-radius: 12px;
    backdrop-filter: blur(12px);
    z-index: 200;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 12px rgba(218, 55, 67, 0.1);
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .booking-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(218, 55, 67, 0.2);
  }

  .booking-title {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .ot-badge {
    background: #da3743;
    color: white;
    font-size: 0.55rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .booking-restaurant {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .booking-close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    font-size: 0.8rem;
    padding: 4px;
    transition: color 0.2s;
  }

  .booking-close:hover {
    color: rgba(255, 255, 255, 0.9);
  }

  .booking-meta {
    display: flex;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .meta-item {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.65rem;
  }

  .booking-empty {
    padding: 24px 16px;
    text-align: center;
  }

  .booking-empty p {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.75rem;
    margin: 0 0 8px;
  }

  .booking-hint {
    color: rgba(255, 255, 255, 0.35) !important;
    font-size: 0.65rem !important;
  }

  .booking-results {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .booking-results::-webkit-scrollbar { width: 3px; }
  .booking-results::-webkit-scrollbar-thumb {
    background: rgba(218, 55, 67, 0.3);
    border-radius: 2px;
  }

  .booking-card {
    padding: 12px;
    background: rgba(218, 55, 67, 0.05);
    border: 1px solid rgba(218, 55, 67, 0.15);
    border-radius: 8px;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .card-name {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .card-rating {
    color: #ffc107;
    font-size: 0.65rem;
    font-weight: 600;
  }

  .card-meta {
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.6rem;
    margin-bottom: 8px;
  }

  .slot-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .slot-btn {
    background: rgba(218, 55, 67, 0.15);
    border: 1px solid rgba(218, 55, 67, 0.4);
    color: rgba(255, 255, 255, 0.9);
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s;
  }

  .slot-btn:hover {
    background: rgba(218, 55, 67, 0.35);
    border-color: rgba(218, 55, 67, 0.7);
    box-shadow: 0 0 8px rgba(218, 55, 67, 0.2);
  }

  .slot-btn.disabled {
    opacity: 0.4;
    cursor: default;
  }

  .no-slots {
    color: rgba(255, 255, 255, 0.3);
    font-size: 0.65rem;
    margin-top: 6px;
  }

  .rest-link, .ot-link {
    display: inline-block;
    color: rgba(218, 55, 67, 0.8);
    font-size: 0.6rem;
    text-decoration: none;
    margin-top: 8px;
    transition: color 0.2s;
  }

  .rest-link:hover, .ot-link:hover {
    color: #da3743;
  }

  .booking-action-btn {
    display: block;
    margin-top: 10px;
    padding: 10px 16px;
    background: rgba(218, 55, 67, 0.2);
    border: 1px solid rgba(218, 55, 67, 0.5);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.75rem;
    font-weight: 500;
    text-align: center;
    text-decoration: none;
    transition: all 0.2s;
    cursor: pointer;
  }

  .booking-action-btn:hover {
    background: rgba(218, 55, 67, 0.4);
    border-color: rgba(218, 55, 67, 0.8);
    box-shadow: 0 0 12px rgba(218, 55, 67, 0.2);
    transform: translateY(-1px);
  }

  .ot-link.bottom {
    display: block;
    text-align: center;
    padding: 10px 16px;
    border-top: 1px solid rgba(218, 55, 67, 0.15);
    font-size: 0.65rem;
  }
</style>
