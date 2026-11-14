export async function mountCredits(root: HTMLElement): Promise<void> {
  root.innerHTML = '<a class="back" href="#">← Back</a><h1>Credits</h1><div class="credits-body">Loading…</div>';
  const body = root.querySelector('.credits-body') as HTMLElement;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/credits.json`);
    if (!res.ok) throw new Error(String(res.status));
    const { items } = await res.json();
    body.replaceChildren();
    for (const it of items) {
      const h = document.createElement('h2');
      h.textContent = `${it.asset} (${it.licence})`;
      const pre = document.createElement('pre');
      pre.textContent = it.text;
      const a = document.createElement('a');
      a.href = it.licenceUrl;
      a.textContent = it.licenceUrl;
      const note = document.createElement('p');
      note.textContent = `Modified: ${it.modified}`;
      body.append(h, pre, a, note);
    }
  } catch (e) {
    body.textContent = `Could not load credits: ${e instanceof Error ? e.message : String(e)}`;
  }
}
