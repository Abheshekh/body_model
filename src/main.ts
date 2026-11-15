import './style.css';
import { confirmAdult, saveProfile } from './me/profile';
import { mountShell } from './ui/shell';

// DEV-only seed for headless screenshots: made-up values, stripped from production builds
if (import.meta.env.DEV) {
  const q = new URLSearchParams(location.search);
  const sex = q.get('seed');
  if (sex === 'male' || sex === 'female') saveProfile({ sex, heightCm: 170, massKg: 70 });
  if (q.get('adult') === '1') confirmAdult();
}

mountShell(document.getElementById('app')!);
