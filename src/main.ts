import './style.css';
import { mountCredits } from './ui/credits';
import { mountExplore } from './ui/explore';
import { mountProfile } from './ui/profile';
import { mountPrograms } from './ui/programs';
import { confirmAdult, loadProfile, saveProfile } from './me/profile';
import { parseRoute } from './programs/programs';
import type { Viewer } from './body/viewer';

// DEV-only seed for headless screenshots: made-up values, stripped from production builds
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const sex = q.get('seed');
  if (sex === 'male' || sex === 'female') saveProfile({ sex, heightCm: 170, massKg: 70 });
  if (q.get('adult') === '1') confirmAdult();
}

const app = document.getElementById('app')!;
const nav = document.createElement('nav');
nav.className = 'nav';
nav.innerHTML = '<a href="#" data-r="explore">Explore</a><a href="#programs" data-r="programs">Programs</a><a href="#profile" data-r="profile">Profile</a>';
const explore = document.createElement('div');
explore.className = 'screen explore';
const credits = document.createElement('div');
credits.className = 'screen credits';
const profile = document.createElement('div');
profile.className = 'screen profile';
const programs = document.createElement('div');
programs.className = 'programs-root';
app.append(nav, explore, credits, profile, programs);
// mounted once and hidden on other screens, so the WebGL context is never recreated
const viewerP: Promise<Viewer | null> = mountExplore(explore).catch(() => null);

let disposePrograms: (() => void) | null = null;

const route = () => {
  disposePrograms?.();
  disposePrograms = null;
  programs.replaceChildren();
  const r = parseRoute(location.hash);
  const gate = loadProfile() === null;
  const screen = gate ? 'profile' : r.screen;
  nav.hidden = gate;
  explore.hidden = screen === 'credits' || screen === 'profile';
  credits.hidden = screen !== 'credits';
  profile.hidden = screen !== 'profile';
  for (const a of nav.querySelectorAll('a')) {
    if (a.dataset.r === screen) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (screen === 'credits') void mountCredits(credits);
  if (screen === 'profile') mountProfile(profile, () => { location.hash = ''; route(); });
  if (screen === 'programs') {
    // the sheet waits for the body; a route change before then cancels the mount
    let dispose: (() => void) | null = null;
    let gone = false;
    disposePrograms = () => { gone = true; dispose?.(); };
    programs.innerHTML = '<section class="sheet">Loading…</section>';
    void viewerP.then((v) => { if (!gone) dispose = mountPrograms(programs, v, loadProfile()!, r.programId); });
  }
};
window.addEventListener('hashchange', route);
route();
