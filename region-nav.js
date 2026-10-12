/**
 * region-nav.js
 * Beit Heller - Hebrew RTL Floor & Region Navigation Component
 * Standalone ES Module with zero external dependencies.
 *
 * API:
 *   export function mountRegionNav({ container, floors, onFloor, onRegion })
 *   returns { setSelection(floorId, regionId), setBusy(boolean), getState(), destroy() }
 */

// Canonical groups
const GROUP_DEFINITIONS = {
  roof: { key: 'roof', label: 'גג', order: 1 },
  offices: { key: 'offices', label: 'משרדים', order: 2 },
  ground: { key: 'ground', label: 'קרקע', order: 3 },
  basements: { key: 'basements', label: 'מרתפים', order: 4 }
};

// Truthful Hebrew status tags (no misleading completion badges)
const STATUS_CONFIG = {
  model: {
    badge: 'מודל תלת-ממדי',
    chip: 'במודל',
    className: 'bhn-status-model'
  },
  partial: {
    badge: 'מודל חלקי',
    chip: 'חלקי',
    className: 'bhn-status-partial'
  },
  source: {
    badge: 'תוכנית מקור',
    chip: 'מקור',
    className: 'bhn-status-source'
  }
};

/**
 * Escape HTML to ensure safety
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Determine which of the 4 groups a floor belongs to.
 */
function classifyFloorGroup(floor) {
  if (floor && floor.group) {
    const g = String(floor.group).trim().toLowerCase();
    if (g === 'roof' || g === 'גג') return 'roof';
    if (g === 'office' || g === 'offices' || g === 'משרד' || g === 'משרדים') return 'offices';
    if (g === 'ground' || g === 'קרקע') return 'ground';
    if (g === 'basement' || g === 'basements' || g === 'מרתף' || g === 'מרתפים') return 'basements';
  }

  const id = String(floor?.id || '').toLowerCase();
  const label = String(floor?.label || '').toLowerCase();
  const combined = `${id} ${label}`;

  if (/גג|roof|\br\b|rooftop|מערכות/.test(combined)) return 'roof';
  if (/מרתף|חניון|תת|basement|\bb[0-9]\b|-\d|sub/.test(combined)) return 'basements';
  if (/קרקע|כניסה|מסחר|לובי|ground|\bg\b|^0$|קומה 0\b/.test(combined)) return 'ground';
  if (/משרד|טיפוס|office|\b[1-9]\b|קומה [1-9]/.test(combined)) return 'offices';

  return 'offices';
}

/**
 * Mount the region navigation component into the target container.
 *
 * @param {Object} options
 * @param {HTMLElement|string} options.container - DOM element or selector string
 * @param {Array} options.floors - Array of floor objects [{ id, label, regions: [{ id, label, status, caption }] }]
 * @param {Function} [options.onFloor] - Callback fired when a floor is selected: onFloor(floorId)
 * @param {Function} [options.onRegion] - Callback fired when a region is selected: onRegion(regionId)
 * @param {string} [options.initialFloorId] - Initial floor ID to select
 * @param {string} [options.initialRegionId] - Initial region ID to select
 * @param {Array<string>} [options.groupOrder] - Order of groups (default: ['roof', 'offices', 'ground', 'basements'])
 * @returns {Object} { setSelection, setBusy, getState, destroy }
 */
export function mountRegionNav({
  container,
  floors = [],
  onFloor,
  onRegion,
  initialFloorId,
  initialRegionId,
  groupOrder = ['roof', 'offices', 'ground', 'basements']
} = {}) {
  const mountEl = typeof container === 'string' ? document.querySelector(container) : container;
  if (!mountEl) {
    throw new Error('[region-nav] Target container not found.');
  }

  // Internal state
  let currentFloors = Array.isArray(floors) ? floors : [];
  let currentFloorId = null;
  let currentRegionId = null;
  let isBusy = false;

  // Initialize selection
  if (currentFloors.length > 0) {
    const matchedFloor = initialFloorId
      ? currentFloors.find(f => String(f.id) === String(initialFloorId))
      : null;
    const activeFloor = matchedFloor || currentFloors[0];
    currentFloorId = activeFloor.id;

    const availableRegions = activeFloor.regions || [];
    if (availableRegions.length > 0) {
      const matchedRegion = initialRegionId
        ? availableRegions.find(r => String(r.id) === String(initialRegionId))
        : null;
      const defaultRegion = matchedRegion
        || availableRegions.find(r => String(r.id) === 'overview')
        || availableRegions[0];
      currentRegionId = defaultRegion ? defaultRegion.id : null;
    }
  }

  // Create component root
  const rootEl = document.createElement('div');
  rootEl.className = 'bhn-root';
  rootEl.dir = 'rtl';
  rootEl.setAttribute('role', 'region');
  rootEl.setAttribute('aria-label', 'ניווט קומות ואזורים בבניין');

  mountEl.innerHTML = '';
  mountEl.appendChild(rootEl);

  /**
   * Render the full component DOM based on current state.
   */
  function render() {
    const focused = rootEl.contains(document.activeElement) ? document.activeElement : null;
    const focusFloor = focused?.getAttribute("data-floor-id");
    const focusRegion = focused?.getAttribute("data-region-id");
    if (currentFloors.length === 0) {
      rootEl.innerHTML = `
        <div class="bhn-empty" role="status">
          <p class="bhn-caption-text">אין נתוני קומות זמינים לתצוגה.</p>
        </div>
      `;
      return;
    }

    const currentFloor = currentFloors.find(f => String(f.id) === String(currentFloorId)) || currentFloors[0];
    const currentFloorGroupKey = classifyFloorGroup(currentFloor);
    const currentFloorGroupDef = GROUP_DEFINITIONS[currentFloorGroupKey] || { label: 'קומה' };

    const availableRegions = currentFloor.regions || [];
    let currentRegion = null;
    if (availableRegions.length > 0) {
      currentRegion = availableRegions.find(r => String(r.id) === String(currentRegionId))
        || availableRegions.find(r => String(r.id) === 'overview')
        || availableRegions[0];
      currentRegionId = currentRegion.id;
    } else {
      currentRegionId = null;
    }

    // Group floors into categories
    const grouped = {
      roof: [],
      offices: [],
      ground: [],
      basements: []
    };

    currentFloors.forEach(fl => {
      const g = classifyFloorGroup(fl);
      if (grouped[g]) {
        grouped[g].push(fl);
      } else {
        grouped.offices.push(fl);
      }
    });

    // Render HTML string
    let html = '';

    // Busy notification bar
    html += `
      <div class="bhn-busy-bar" role="status" aria-live="polite">
        <span class="bhn-spinner" aria-hidden="true"></span>
        <span>מעדכן תצוגת מבט...</span>
      </div>
    `;

    // Floor groups section
    html += `
      <div class="bhn-floors-wrapper">
        <div class="bhn-section-eyebrow">
          <span>בחירת קומה ואגף</span>
        </div>
        <div class="bhn-floor-groups" role="group" aria-label="קומות הבניין מחולקות לפי אגפים">
    `;

    groupOrder.forEach(gKey => {
      const flList = grouped[gKey];
      if (!flList || flList.length === 0) return;

      const gDef = GROUP_DEFINITIONS[gKey] || { label: gKey };
      const isActiveGroup = flList.some(f => String(f.id) === String(currentFloor.id));

      html += `
        <div class="bhn-group ${isActiveGroup ? 'is-active-group' : ''}" data-group="${escapeHtml(gKey)}">
          <span class="bhn-group-title">${escapeHtml(gDef.label)}</span>
          <div class="bhn-group-buttons">
      `;

      flList.forEach(fl => {
        const isSelected = String(fl.id) === String(currentFloor.id);
        const btnLabel = fl.shortLabel || fl.label;
        html += `
          <button type="button"
                  class="bhn-floor-btn"
                  data-floor-id="${escapeHtml(fl.id)}"
                  aria-pressed="${isSelected ? 'true' : 'false'}"
                  title="${escapeHtml(fl.label)}" aria-label="${escapeHtml(fl.label)}"
                  ${isBusy ? 'disabled' : ''}>
            ${escapeHtml(btnLabel)}
          </button>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    // Current floor heading & hierarchy banner
    const regionTitle = currentRegion ? currentRegion.label : 'ללא אזורים מוגדרים';
    const regionsCountText = availableRegions.length === 1
      ? 'אזור 1'
      : `${availableRegions.length} אזורים`;

    html += `
      <div class="bhn-floor-banner" aria-live="polite">
        <div class="bhn-breadcrumb">
          <span>${escapeHtml(currentFloorGroupDef.label)}</span>
          <span class="bhn-breadcrumb-sep" aria-hidden="true">/</span>
          <span>${escapeHtml(currentFloor.label)}</span>
          <span class="bhn-breadcrumb-sep" aria-hidden="true">/</span>
          <span class="bhn-breadcrumb-current">${escapeHtml(regionTitle)}</span>
        </div>
        <div class="bhn-floor-heading-row">
          <h3 class="bhn-floor-title">${escapeHtml(currentFloor.label)}</h3>
          <span class="bhn-regions-count">${escapeHtml(regionsCountText)}</span>
        </div>
      </div>
    `;

    // Regions section (chips)
    if (availableRegions.length > 0) {
      html += `
        <div class="bhn-regions-section">
          <div class="bhn-regions-header">
            <span class="bhn-section-eyebrow">אזורים בקומה</span>
          </div>
          <div class="bhn-region-chips" role="group" aria-label="בחירת אזור בקומה ${escapeHtml(currentFloor.label)}">
      `;

      availableRegions.forEach(reg => {
        const isRegSelected = String(reg.id) === String(currentRegion.id);
        const statusMeta = STATUS_CONFIG[reg.status] || null;

        html += `
          <button type="button"
                  class="bhn-chip"
                  data-region-id="${escapeHtml(reg.id)}"
                  aria-pressed="${isRegSelected ? 'true' : 'false'}"
                  ${isBusy ? 'disabled' : ''}>
            <span class="bhn-chip-title">${escapeHtml(reg.label)}</span>
        `;

        if (statusMeta) {
          html += `
            <span class="bhn-chip-tag ${escapeHtml(statusMeta.className)}" aria-hidden="true">
              ${escapeHtml(statusMeta.chip)}
            </span>
          `;
        }

        html += `</button>`;
      });

      html += `
          </div>
        </div>
      `;
    }

    // Active Region Caption & Status Card
    if (currentRegion) {
      const activeStatusMeta = STATUS_CONFIG[currentRegion.status] || null;
      const captionText = currentRegion.caption || 'אין תיאור זמין לאזור זה.';

      html += `
        <div class="bhn-caption-card" aria-live="polite">
          <div class="bhn-caption-header">
            <h4 class="bhn-caption-title">${escapeHtml(currentRegion.label)}</h4>
      `;

      if (activeStatusMeta) {
        html += `
            <span class="bhn-status-badge ${escapeHtml(activeStatusMeta.className)}"
                  aria-label="סטטוס המחשה: ${escapeHtml(activeStatusMeta.badge)}">
              ${escapeHtml(activeStatusMeta.badge)}
            </span>
        `;
      }

      html += `
          </div>
          <p class="bhn-caption-text">${escapeHtml(captionText)}</p>
        </div>
      `;
    }

    rootEl.innerHTML = html;
    rootEl.classList.toggle('is-busy', isBusy);
    rootEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');

    attachEvents();
    if(focusFloor) rootEl.querySelector(`[data-floor-id="${CSS.escape(focusFloor)}"]`)?.focus({preventScroll:true});
    if(focusRegion) rootEl.querySelector(`[data-region-id="${CSS.escape(focusRegion)}"]`)?.focus({preventScroll:true});
  }

  /**
   * Attach click and keyboard events to interactive elements.
   */
  function attachEvents() {
    // Floor button clicks
    const floorButtons = rootEl.querySelectorAll('.bhn-floor-btn');
    floorButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (isBusy) return;
        const targetFloorId = btn.getAttribute('data-floor-id');
        if (!targetFloorId) return;

        if (String(targetFloorId) === String(currentFloorId)) {
          // Already on this floor: idempotent
          return;
        }

        const nextFloor = currentFloors.find(f => String(f.id) === String(targetFloorId));
        if (!nextFloor) return;

        currentFloorId = nextFloor.id;
        const availableRegions = nextFloor.regions || [];
        const defaultRegion = availableRegions.find(r => String(r.id) === 'overview')
          || availableRegions[0]
          || null;
        currentRegionId = defaultRegion ? defaultRegion.id : null;

        render();

        if (typeof onFloor === 'function') {
          onFloor(currentFloorId);
        }
        if (typeof onRegion === 'function' && currentRegionId) {
          onRegion(currentRegionId);
        }
      });
    });

    // Region chip clicks
    const chipButtons = rootEl.querySelectorAll('.bhn-chip');
    chipButtons.forEach((chip, index) => {
      chip.addEventListener('click', () => {
        if (isBusy) return;
        const targetRegionId = chip.getAttribute('data-region-id');
        if (!targetRegionId) return;

        if (String(targetRegionId) === String(currentRegionId)) {
          return;
        }

        currentRegionId = targetRegionId;
        render();

        if (typeof onRegion === 'function') {
          onRegion(currentRegionId);
        }
      });

      // Keyboard left/right arrow navigation between chips
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          // In RTL, ArrowLeft moves forward (next chip)
          e.preventDefault();
          const nextIndex = (index + 1) % chipButtons.length;
          chipButtons[nextIndex].focus();
        } else if (e.key === 'ArrowRight') {
          // In RTL, ArrowRight moves backward (previous chip)
          e.preventDefault();
          const prevIndex = (index - 1 + chipButtons.length) % chipButtons.length;
          chipButtons[prevIndex].focus();
        }
      });
    });
  }

  // Initial render
  render();

  /**
   * Programmatic selection API.
   *
   * @param {string} floorId - Floor ID to select
   * @param {string} [regionId] - Region ID to select on that floor
   */
  function setSelection(floorId, regionId) {
    if (!floorId && !regionId) return;

    let targetFloor = null;
    if (floorId) {
      targetFloor = currentFloors.find(f => String(f.id) === String(floorId));
    } else if (regionId) {
      // Find which floor has this region
      targetFloor = currentFloors.find(f =>
        (f.regions || []).some(r => String(r.id) === String(regionId))
      );
    }

    if (!targetFloor) {
      console.warn(`[region-nav] Floor "${floorId}" was not found.`);
      return;
    }

    currentFloorId = targetFloor.id;
    const availableRegions = targetFloor.regions || [];

    if (regionId) {
      const targetRegion = availableRegions.find(r => String(r.id) === String(regionId));
      if (targetRegion) {
        currentRegionId = targetRegion.id;
      } else {
        // Fallback to overview or first
        const fallback = availableRegions.find(r => String(r.id) === 'overview') || availableRegions[0] || null;
        currentRegionId = fallback ? fallback.id : null;
      }
    } else {
      // No region specified: default to 'overview' if present, else first
      const defaultReg = availableRegions.find(r => String(r.id) === 'overview') || availableRegions[0] || null;
      currentRegionId = defaultReg ? defaultReg.id : null;
    }

    render();
  }

  /**
   * Programmatic busy state API.
   *
   * @param {boolean} busy - Whether viewer / camera transition is in progress
   */
  function setBusy(busy) {
    isBusy = Boolean(busy);
    rootEl.classList.toggle('is-busy', isBusy);
    rootEl.setAttribute('aria-busy', isBusy ? 'true' : 'false');

    const buttons = rootEl.querySelectorAll('button');
    buttons.forEach(btn => {
      btn.disabled = isBusy;
    });

    const busyBar = rootEl.querySelector('.bhn-busy-bar');
    if (busyBar) {
      busyBar.style.display = isBusy ? 'flex' : 'none';
    }
  }

  /**
   * Return current internal state
   */
  function getState() {
    return {
      floorId: currentFloorId,
      regionId: currentRegionId,
      isBusy
    };
  }

  /**
   * Destroy component and cleanup DOM
   */
  function destroy() {
    rootEl.innerHTML = '';
    rootEl.remove();
  }

  return {
    setSelection,
    setBusy,
    getState,
    destroy
  };
}
