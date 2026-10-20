import { clampMapShare, nearestCardIndex, nearestPanelStop } from './explorer-interactions';

/** Native touch momentum remains browser-owned. Only mouse dragging is synthesized. */
export function createMobileExplorer(onSelect: (id: string) => void, onResize: () => void) {
  const media = matchMedia('(max-width: 800px), (max-height: 500px) and (pointer: coarse)');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const layout = document.querySelector<HTMLElement>('.explorer-layout')!;
  const panel = document.querySelector<HTMLElement>('#activity-panel')!;
  const list = document.querySelector<HTMLElement>('#activity-list')!;
  const head = panel.querySelector<HTMLElement>('.panel-head')!;
  panel.insertAdjacentHTML('afterbegin', `<div class="mobile-panel-bar"><div class="panel-handle" role="slider" aria-orientation="vertical" tabindex="0" aria-label="Map height" aria-valuemin="20" aria-valuemax="65" aria-valuenow="50" aria-valuetext="Browse: 50 percent map"><span></span></div><div class="panel-modes" aria-label="Explorer layout"><button data-share="65">Explore</button><button data-share="50" aria-pressed="true">Browse</button><button data-share="20">Details</button></div></div>`);
  head.insertAdjacentHTML('beforeend', '<button class="mobile-filter-button" aria-expanded="false" aria-controls="panel-controls">Filters</button>');
  list.insertAdjacentHTML('afterend', '<nav class="carousel-position" aria-label="Project carousel"><button type="button" aria-label="Previous project">←</button><span role="status" aria-live="polite">Loading records…</span><button type="button" aria-label="Next project">→</button></nav>');
  const indicator = panel.querySelector<HTMLElement>('.carousel-position span')!;
  const handle = panel.querySelector<HTMLElement>('.panel-handle')!;
  const filterButton = panel.querySelector<HTMLButtonElement>('.mobile-filter-button')!;
  let share = 50, activeId: string | null = null, targetId: string | null = null;
  let scrollTimer = 0, frame = 0, dragging = false, suppressClick = false;
  const cards = () => Array.from(list.querySelectorAll<HTMLElement>('.activity-card'));
  const motion = (): ScrollBehavior => reduced.matches ? 'instant' : 'smooth';
  function setShare(value: number, snap = true) {
    share = snap ? nearestPanelStop(value) : clampMapShare(value);
    layout.style.setProperty('--map-share', `${share}%`);
    handle.setAttribute('aria-valuenow', String(Math.round(share)));
    handle.setAttribute('aria-valuetext', `${share === 65 ? 'Explore' : share === 20 ? 'Details' : 'Browse'}: ${Math.round(share)} percent map`);
    panel.querySelectorAll<HTMLButtonElement>('[data-share]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.share) === share)));
  }
  function align(id: string, behavior = motion()) {
    const card = cards().find(card => card.dataset.id === id);
    if (!card || !media.matches) return;
    targetId = id;
    list.scrollTo({ left: card.offsetLeft - (list.clientWidth - card.offsetWidth) / 2, behavior });
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(settle, 220);
  }
  function mark(id: string | null) {
    activeId = id;
    const all = cards();
    all.forEach(card => { const selected = card.dataset.id === id; card.classList.toggle('selected', selected); card.setAttribute('aria-current', String(selected)); });
    const index = all.findIndex(card => card.dataset.id === id);
    indicator.textContent = all.length ? `${Math.max(1, index + 1)} / ${all.length} · Swipe to explore` : 'No matching records';
    const buttons = panel.querySelectorAll<HTMLButtonElement>('.carousel-position button');
    buttons[0].disabled = index <= 0;
    buttons[1].disabled = index < 0 || index >= all.length - 1;
  }
  function settle() {
    if (!media.matches || dragging) return;
    const all = cards();
    const index = nearestCardIndex(all.map(card => card.offsetLeft + card.offsetWidth / 2), list.scrollLeft + list.clientWidth / 2);
    if (index < 0) return;
    const id = all[index].dataset.id!;
    // Programmatic scrolling must reach its target before accepting a new selection.
    if (targetId && targetId !== id) return;
    targetId = null;
    if (id !== activeId) { mark(id); onSelect(id); }
  }
  list.addEventListener('scroll', () => {
    if (!media.matches) return;
    clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(settle, 140);
  }, { passive: true });
  list.addEventListener('scrollend', settle);
  list.addEventListener('pointerdown', event => {
    targetId = null;
    if (!media.matches || event.pointerType !== 'mouse' || event.button !== 0 || (event.target as HTMLElement).closest('a, button, summary')) return;
    const start = event.clientX, initial = list.scrollLeft;
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved && Math.abs(e.clientX - start) < 5) return;
      moved = dragging = true;
      list.classList.add('mouse-dragging');
      list.setPointerCapture(event.pointerId);
      list.scrollLeft = initial + start - e.clientX;
    };
    const end = () => {
      list.removeEventListener('pointermove', move);
      list.removeEventListener('pointerup', end);
      list.removeEventListener('pointercancel', end);
      dragging = false;
      list.classList.remove('mouse-dragging');
      if (moved) {
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        const all = cards();
        const index = nearestCardIndex(all.map(card => card.offsetLeft + card.offsetWidth / 2), list.scrollLeft + list.clientWidth / 2);
        if (index >= 0) align(all[index].dataset.id!);
      }
    };
    list.addEventListener('pointermove', move);
    list.addEventListener('pointerup', end);
    list.addEventListener('pointercancel', end);
  });
  list.addEventListener('click', e => { if (suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    handle.setPointerCapture(event.pointerId);
    const start = event.clientY, initial = share;
    layout.classList.add('panel-dragging');
    const move = (e: PointerEvent) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setShare(initial + (e.clientY - start) / layout.clientHeight * 100, false)); };
    const end = () => { cancelAnimationFrame(frame); layout.classList.remove('panel-dragging'); setShare(share); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
  handle.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    setShare(event.key === 'Home' ? 20 : event.key === 'End' ? 65 : share + (event.key === 'ArrowUp' ? -25 : 25));
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-share]').forEach(button => button.addEventListener('click', () => setShare(Number(button.dataset.share))));
  filterButton.addEventListener('click', () => {
    const open = panel.classList.toggle('filters-open');
    filterButton.setAttribute('aria-expanded', String(open));
  });
  panel.querySelectorAll<HTMLButtonElement>('.carousel-position button').forEach((button, index) => button.addEventListener('click', () => {
    const all = cards(), current = all.findIndex(card => card.dataset.id === activeId);
    const next = all[current + (index === 0 ? -1 : 1)];
    if (next) { mark(next.dataset.id!); onSelect(next.dataset.id!); align(next.dataset.id!); }
  }));
  list.addEventListener('keydown', event => {
    if (!media.matches || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    panel.querySelectorAll<HTMLButtonElement>('.carousel-position button')[event.key === 'ArrowLeft' ? 0 : 1].click();
    cards().find(card => card.dataset.id === activeId)?.focus({ preventScroll: true });
  });
  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(onResize);
  }).observe(document.querySelector('.map-shell')!);
  let width = list.clientWidth;
  new ResizeObserver(() => {
    if (width === list.clientWidth) return;
    width = list.clientWidth;
    if (activeId) align(activeId, 'instant');
  }).observe(list);
  media.addEventListener('change', () => { if (activeId) align(activeId, 'instant'); onResize(); });
  setShare(50);
  return {
    isMobile: () => media.matches,
    select(id: string, scroll = true) { mark(id); if (scroll) align(id); },
    refresh(id: string | null) { targetId = null; mark(id); if (id) align(id, 'instant'); },
    closeFilters() { panel.classList.remove('filters-open'); filterButton.setAttribute('aria-expanded', 'false'); }
  };
}
