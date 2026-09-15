/** Small enhancements shared by every page of the site. */

export function initCopyButtons(): void {
  for (const pre of document.querySelectorAll<HTMLPreElement>('pre')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.textContent = 'Copy';
    button.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Press Ctrl+C';
      }
      window.setTimeout(() => (button.textContent = 'Copy'), 1500);
    });
    pre.append(button);
  }
}

/** Highlights the sidebar link of the section currently in view. */
export function initScrollSpy(): void {
  const links = [...document.querySelectorAll<HTMLAnchorElement>('.sidebar a[href^="#"]')];
  if (!links.length || typeof IntersectionObserver === 'undefined') return;
  const byId = new Map(links.map((a) => [a.getAttribute('href')?.slice(1) ?? '', a]));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const a of links) a.classList.remove('active');
        byId.get(entry.target.id)?.classList.add('active');
      }
    },
    { rootMargin: '-72px 0px -70% 0px', threshold: 0 },
  );
  for (const id of byId.keys()) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }
}
