<script lang="ts">
  /**
   * Restaurant results panel — overlays on MapOverlay
   * Shows OpenTable restaurant search results as floating cards
   */
  import type { FoodSearchData, RestaurantInfo } from "@zerojarvis/shared";

  interface Props {
    data: FoodSearchData;
    selectedName?: string;
    onSelect?: (restaurant: RestaurantInfo) => void;
  }

  let { data, selectedName = "", onSelect }: Props = $props();
  let expanded = $state(true);
</script>

<div class="restaurant-panel" class:expanded>
  <button class="panel-toggle" onclick={() => expanded = !expanded}>
    <span class="toggle-icon">{expanded ? '◀' : '▶'}</span>
    <span class="toggle-label">{data.restaurants.length} 間餐廳</span>
  </button>

  <div class="panel-content">
    <div class="panel-header">
      <span class="search-query">{data.query}</span>
    </div>

    <div class="restaurant-list">
      {#each data.restaurants as restaurant, i}
        <button
          class="restaurant-card"
          class:selected={selectedName === restaurant.name}
          onclick={() => onSelect?.(restaurant)}
        >
          <div class="card-rank">#{i + 1}</div>
          <div class="card-body">
            <div class="card-name">{restaurant.name}</div>
            <div class="card-meta">
              {#if restaurant.rating}
                <span class="card-rating">★ {restaurant.rating.toFixed(1)}</span>
              {/if}
              {#if restaurant.reviews}
                <span class="card-reviews">({restaurant.reviews})</span>
              {/if}
              {#if restaurant.priceRange}
                <span class="card-price">{restaurant.priceRange}</span>
              {/if}
              {#if restaurant.cuisine}
                <span class="card-cuisine">{restaurant.cuisine}</span>
              {/if}
            </div>
            {#if restaurant.address}
              <div class="card-location">{restaurant.address}</div>
            {/if}
            <div class="card-actions">
              {#if restaurant.status}
                <span class="card-status" class:open={restaurant.status === '營業中'} class:closed={restaurant.status === '已打烊'}>
                  {restaurant.status}
                </span>
              {/if}
              {#if restaurant.mapsUrl}
                <a
                  class="maps-link"
                  href={restaurant.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onclick={(e) => e.stopPropagation()}
                  title="在 Google Maps 開啟"
                >↗ 地圖</a>
              {/if}
            </div>
          </div>
          <div class="card-locate" title="定位">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="10" r="3"/>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            </svg>
          </div>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .restaurant-panel {
    position: absolute;
    left: 0;
    top: 60px;
    bottom: 60px;
    width: 44px;
    z-index: 20;
    display: flex;
    transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: all;
  }

  .restaurant-panel.expanded {
    width: 300px;
  }

  .panel-toggle {
    position: absolute;
    right: -36px;
    top: 50%;
    transform: translateY(-50%);
    width: 36px;
    height: 80px;
    background: rgba(0, 10, 20, 0.85);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-left: none;
    border-radius: 0 8px 8px 0;
    color: rgba(0, 212, 255, 0.9);
    font-size: 0.65rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: background 0.2s;
  }

  .panel-toggle:hover {
    background: rgba(0, 20, 40, 0.9);
  }

  .toggle-icon { font-size: 0.8rem; }

  .toggle-label {
    writing-mode: vertical-rl;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
  }

  .panel-content {
    width: 100%;
    height: 100%;
    background: rgba(0, 10, 20, 0.88);
    border-right: 1px solid rgba(0, 212, 255, 0.2);
    backdrop-filter: blur(12px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    transform: translateX(-100%);
    transition: opacity 0.3s, transform 0.3s;
  }

  .expanded .panel-content {
    opacity: 1;
    transform: translateX(0);
  }

  .panel-header {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(0, 212, 255, 0.15);
  }

  .search-query {
    color: rgba(0, 212, 255, 0.9);
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.05em;
  }

  .restaurant-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .restaurant-list::-webkit-scrollbar { width: 3px; }
  .restaurant-list::-webkit-scrollbar-thumb {
    background: rgba(0, 212, 255, 0.3);
    border-radius: 2px;
  }

  .restaurant-card {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(0, 212, 255, 0.04);
    border: 1px solid rgba(0, 212, 255, 0.1);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    color: inherit;
    width: 100%;
  }

  .restaurant-card:hover {
    background: rgba(0, 212, 255, 0.1);
    border-color: rgba(0, 212, 255, 0.4);
    transform: translateX(2px);
  }

  .restaurant-card.selected {
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.6);
    box-shadow: 0 0 8px rgba(0, 212, 255, 0.15);
  }

  .card-rank {
    color: rgba(0, 212, 255, 0.5);
    font-size: 0.65rem;
    font-weight: 600;
    min-width: 20px;
    padding-top: 2px;
  }

  .card-body { flex: 1; min-width: 0; }

  .card-name {
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 3px;
  }

  .card-meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 2px;
  }

  .card-rating {
    color: #ffc107;
    font-size: 0.65rem;
    font-weight: 600;
  }

  .card-reviews {
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.6rem;
  }

  .card-price {
    color: rgba(0, 212, 255, 0.6);
    font-size: 0.6rem;
  }

  .card-cuisine {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.6rem;
  }

  .card-location {
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.6rem;
    margin-top: 2px;
  }

  .card-status {
    font-size: 0.55rem;
    margin-top: 3px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
  }

  .card-status.open { color: #4caf50; }
  .card-status.closed { color: #f44336; }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
  }

  .maps-link {
    color: rgba(0, 212, 255, 0.7);
    font-size: 0.55rem;
    text-decoration: none;
    padding: 1px 5px;
    border: 1px solid rgba(0, 212, 255, 0.25);
    border-radius: 3px;
    transition: all 0.2s;
  }

  .maps-link:hover {
    background: rgba(0, 212, 255, 0.15);
    border-color: rgba(0, 212, 255, 0.5);
    color: rgba(0, 212, 255, 1);
  }

  .card-locate {
    color: rgba(0, 212, 255, 0.4);
    flex-shrink: 0;
    padding-top: 2px;
    transition: color 0.2s;
  }

  .restaurant-card:hover .card-locate,
  .restaurant-card.selected .card-locate {
    color: rgba(0, 212, 255, 0.9);
  }
</style>
