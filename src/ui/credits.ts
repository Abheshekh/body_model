type Source = { name?: string; title?: string; url: string; licence: string; licenceUrl?: string; provides?: string; note?: string };

export async function mountCredits(root: HTMLElement): Promise<void> {
  root.innerHTML = '<a class="back" href="#me">← Back</a><h1>Credits</h1><div class="credits-body">Loading…</div>';
  const body = root.querySelector('.credits-body') as HTMLElement;
  try {
    const base = import.meta.env.BASE_URL;
    const get = async (f: string) => {
      const res = await fetch(`${base}data/${f}`);
      if (!res.ok) throw new Error(`${f} ${res.status}`);
      return res.json();
    };
    const [anatomy, facts] = await Promise.all([get('body/credits.json'), get('facts.json')]);
    const items: Source[] = [...anatomy, ...facts.sources];
    body.replaceChildren();
    for (const it of items) {
      const h = document.createElement('h2');
      h.textContent = `${it.name ?? it.title} (${it.licence})`;
      const a = document.createElement('a');
      a.href = it.licenceUrl ?? it.url;
      a.textContent = a.href;
      const p = document.createElement('p');
      p.textContent = [it.provides, it.note].filter(Boolean).join(' ');
      body.append(h, p, a);
    }
  } catch (e) {
    body.textContent = `Could not load credits: ${e instanceof Error ? e.message : String(e)}`;
  }
}
