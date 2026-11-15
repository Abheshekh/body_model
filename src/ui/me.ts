// Me page (R7): the profile form plus a Credits link.
import { mountProfile } from './profile';

export function mountMe(root: HTMLElement, onSaved: () => void): void {
  mountProfile(root, onSaved);
  const p = document.createElement('p');
  p.className = 'me-links';
  p.innerHTML = '<a href="#me/credits">Credits</a>';
  root.append(p);
}
