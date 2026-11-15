// Body page panel (T6a, T6b). Wide: side panel. Phone and tablet portrait (< 900 px): bottom sheet
// collapsed to the card (when a part is selected) and the depth slider (`peek`), opening to 72% height;
// `more` shows only while open (CSS on `.body-page.open`). The collapsed height is measured into
// `--peek`, so the canvas always sits above the collapsed sheet and the body is never covered.
export interface Sheet {
  el: HTMLElement;
  card: HTMLElement;
  peek: HTMLElement;
  more: HTMLElement;
  setOpen(on: boolean): void;
}

export const SHEET_MQ = '(max-width: 899.98px)';

export function createSheet(root: HTMLElement): Sheet {
  const el = document.createElement('aside');
  el.className = 'body-sheet';
  el.setAttribute('aria-label', 'Depth, systems and parts');
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'body-handle';
  const card = document.createElement('div');
  const peek = document.createElement('div');
  const more = document.createElement('div');
  more.className = 'more';
  el.append(handle, card, peek, more);
  const setOpen = (on: boolean) => {
    root.classList.toggle('open', on);
    handle.setAttribute('aria-expanded', String(on));
    handle.setAttribute('aria-label', on ? 'Show fewer controls' : 'Show more controls');
  };
  handle.addEventListener('click', () => setOpen(!root.classList.contains('open')));
  setOpen(false);

  const mq = matchMedia(SHEET_MQ);
  const measure = () => {
    if (!mq.matches) return root.style.removeProperty('--peek');
    const px = handle.offsetHeight + card.offsetHeight + peek.offsetHeight;
    root.style.setProperty('--peek', `calc(${px}px + env(safe-area-inset-bottom))`);
  };
  const ro = new ResizeObserver(measure);
  for (const e of [handle, card, peek]) ro.observe(e);
  mq.addEventListener('change', measure);
  return { el, card, peek, more, setOpen };
}
