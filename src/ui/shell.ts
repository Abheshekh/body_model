// App shell (R7): tab bar (bottom on phone, top on wide) with Body, Workouts and Me, and the hash routes.
// One body viewer for the app (one WebGL context): created on the first route past the profile gate,
// then kept; other pages only hide it.
import { createBodyViewer, type BodyViewer } from '../body/scene';
import { loadProfile } from '../me/profile';
import { parseRoute } from '../programs/programs';
import { mountBodyPage } from './body/page';
import { mountCredits } from './credits';
import { mountMe } from './me';
import { mountProfile } from './profile';
import { mountPrograms } from './programs';
import { mountWorkouts } from './workouts';

const div = (cls: string): HTMLElement => {
  const e = document.createElement('div');
  e.className = cls;
  return e;
};

export function mountShell(app: HTMLElement): void {
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Pages');
  nav.innerHTML = '<a href="#body" data-r="body">Body</a><a href="#workouts" data-r="workouts">Workouts</a><a href="#me" data-r="me">Me</a>';
  const body = div('screen');
  const stage = div('body-stage');
  const canvas = document.createElement('canvas');
  stage.append(canvas);
  body.append(stage);
  const workouts = div('screen page');
  const me = div('screen page');
  const credits = div('screen page credits');
  const programs = div('programs-root');
  app.replaceChildren(nav, body, workouts, me, credits, programs);
  mountWorkouts(workouts);

  const fps = new URLSearchParams(location.search).get('fps') === '1';
  let viewerP: Promise<BodyViewer | null> | null = null;
  // a load failure is shown by the viewer on the stage; the rest of the app stays usable
  const viewer = () => (viewerP ??= createBodyViewer(canvas, { fps })
    .then((v) => { mountBodyPage(body, v); return v; })
    .catch(() => null));

  let disposePrograms: (() => void) | null = null;
  const toBody = () => { location.hash = '#body'; route(); };

  const route = () => {
    disposePrograms?.();
    disposePrograms = null;
    programs.replaceChildren();
    const r = parseRoute(location.hash);
    const gate = loadProfile() === null;
    const screen = gate ? 'me' : r.screen;
    const tab = screen === 'programs' ? 'workouts' : screen === 'credits' ? 'me' : screen;
    nav.hidden = gate;
    // Programs draw on the body: the canvas stays, the Body page controls hide
    body.hidden = screen !== 'body' && screen !== 'programs';
    body.classList.toggle('behind', screen === 'programs');
    workouts.hidden = screen !== 'workouts';
    me.hidden = screen !== 'me';
    credits.hidden = screen !== 'credits';
    for (const a of nav.querySelectorAll('a')) {
      if (a.dataset.r === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    if (gate) return mountProfile(me, toBody);
    const viewerReady = viewer();
    // the Me page sets the view sex to the saved profile's sex (the Body page switch is a view toggle)
    if (screen === 'me') mountMe(me, () => { void viewerReady.then((v) => v?.setState({ sex: loadProfile()!.sex })); toBody(); });
    if (screen === 'credits') void mountCredits(credits);
    if (screen === 'programs') {
      // the sheet waits for the body; a route change before then cancels the mount
      let dispose: (() => void) | null = null;
      let gone = false;
      disposePrograms = () => { gone = true; dispose?.(); };
      programs.innerHTML = '<section class="sheet">Loading…</section>';
      // a failed body load gives null: list and text only
      void viewerReady.then((v) => { if (!gone) dispose = mountPrograms(programs, v, loadProfile()!, r.programId); });
    }
  };
  addEventListener('hashchange', route);
  route();
}
