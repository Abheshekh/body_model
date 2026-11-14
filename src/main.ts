import './style.css';
import { mountCredits } from './ui/credits';
import { mountExplore } from './ui/explore';

const app = document.getElementById('app')!;
const explore = document.createElement('div');
explore.className = 'screen explore';
const credits = document.createElement('div');
credits.className = 'screen credits';
app.append(explore, credits);
mountExplore(explore); // mounted once and hidden on #credits, so the WebGL context is never recreated

const route = () => {
  const isCredits = location.hash === '#credits';
  explore.hidden = isCredits;
  credits.hidden = !isCredits;
  if (isCredits) void mountCredits(credits);
};
window.addEventListener('hashchange', route);
route();
