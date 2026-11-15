import { loadProfile, profileErrors, saveProfile } from '../me/profile';

export function mountProfile(root: HTMLElement, onSaved: () => void): void {
  const cur = loadProfile();
  root.innerHTML = `
    <form class="form" novalidate>
      <h1>Your profile</h1>
      <p class="muted">Used to choose which programs you see. Stored on this device only. Nothing is sent anywhere.</p>
      <fieldset class="field">
        <legend>Sex</legend>
        <label class="choice"><input type="radio" name="sex" value="male" /> Male</label>
        <label class="choice"><input type="radio" name="sex" value="female" /> Female</label>
        <div class="error" data-for="sex" aria-live="polite"></div>
      </fieldset>
      <div class="field">
        <label for="p-height">Height</label>
        <div class="with-unit"><input id="p-height" name="height" inputmode="numeric" autocomplete="off" /><span>cm</span></div>
        <div class="error" data-for="height" aria-live="polite"></div>
      </div>
      <div class="field">
        <label for="p-mass">Body mass</label>
        <div class="with-unit"><input id="p-mass" name="mass" inputmode="numeric" autocomplete="off" /><span>kg</span></div>
        <div class="error" data-for="mass" aria-live="polite"></div>
      </div>
      <button type="submit" class="primary" disabled>Save</button>
      <div class="error" data-for="save" aria-live="polite"></div>
    </form>`;
  const form = root.querySelector('form') as HTMLFormElement;
  const h = form.elements.namedItem('height') as HTMLInputElement;
  const m = form.elements.namedItem('mass') as HTMLInputElement;
  const save = form.querySelector('button') as HTMLButtonElement;
  const sexBox = (v: string) => form.querySelector(`input[name=sex][value=${v}]`) as HTMLInputElement;
  if (cur) {
    sexBox(cur.sex).checked = true;
    h.value = String(cur.heightCm);
    m.value = String(cur.massKg);
  }
  const touched = new Set<string>();
  const read = () => ({
    sex: (form.querySelector('input[name=sex]:checked') as HTMLInputElement | null)?.value as 'male' | 'female' | undefined,
    heightCm: h.value.trim() === '' ? NaN : Number(h.value),
    massKg: m.value.trim() === '' ? NaN : Number(m.value),
  });
  const show = (k: string, text?: string) => {
    (form.querySelector(`[data-for=${k}]`) as HTMLElement).textContent = touched.has(k) && text ? text : '';
  };
  const refresh = () => {
    const v = read();
    const e = profileErrors(v);
    show('sex', e.sex);
    show('height', e.height);
    show('mass', e.mass);
    save.disabled = Object.keys(e).length > 0;
    return v;
  };
  form.addEventListener('input', (ev) => {
    touched.add((ev.target as HTMLInputElement).name === 'sex' ? 'sex' : (ev.target as HTMLInputElement).name);
    refresh();
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = refresh();
    if (save.disabled) return;
    if (!saveProfile({ sex: v.sex!, heightCm: v.heightCm, massKg: v.massKg })) {
      (form.querySelector('[data-for=save]') as HTMLElement).textContent = 'Could not save on this device.';
      return;
    }
    onSaved();
  });
  refresh();
}
