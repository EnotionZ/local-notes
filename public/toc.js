// TOC: highlight active heading as the user scrolls.
(function () {
  const tocLinks = Array.from(document.querySelectorAll('.toc-link'));
  if (!tocLinks.length) return;

  const markdownBody = document.getElementById('markdown-body');
  if (!markdownBody) return;

  // Persist collapse state.
  const details = document.querySelector('.toc-details');
  if (details) {
    const STORAGE_KEY = 'toc-open';
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'false') details.removeAttribute('open');
    details.addEventListener('toggle', () => {
      localStorage.setItem(STORAGE_KEY, details.open ? 'true' : 'false');
    });
  }

  // Collect heading elements that have a corresponding TOC entry.
  const headingIds = tocLinks.map((a) => a.dataset.headingId).filter(Boolean);
  const headings = headingIds
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  function setActive(id) {
    tocLinks.forEach((a) => {
      const isActive = a.dataset.headingId === id;
      a.classList.toggle('toc-link-active', isActive);
    });
  }

  // Track all currently-intersecting headings so we always know the full set,
  // not just what changed in the last observer batch.
  const intersecting = new Set();
  let suppressObserver = false;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) intersecting.add(e.target.id);
        else intersecting.delete(e.target.id);
      });
      if (suppressObserver) return;
      // Find the topmost heading (in document order) that is currently visible.
      const topmost = headings.find((h) => intersecting.has(h.id));
      if (topmost) setActive(topmost.id);
    },
    {
      root: markdownBody,
      rootMargin: '0px 0px -80% 0px',
      threshold: 0
    }
  );

  headings.forEach((h) => observer.observe(h));

  // On load: scroll to hash if present, otherwise mark the first heading active.
  const initialHash = window.location.hash.slice(1);
  const initialTarget = initialHash && document.getElementById(initialHash);
  if (initialTarget) {
    const targetTop = initialTarget.getBoundingClientRect().top - markdownBody.getBoundingClientRect().top + markdownBody.scrollTop;
    markdownBody.scrollTop = targetTop - 16;
    setActive(initialHash);
  } else if (headings.length) {
    setActive(headings[0].id);
  }

  // Smooth-scroll TOC links within the markdown body.
  tocLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.dataset.headingId;
      const target = id && document.getElementById(id);
      if (!target || !markdownBody) return;
      e.preventDefault();
      history.pushState(null, '', '#' + id);
      const targetTop = target.getBoundingClientRect().top - markdownBody.getBoundingClientRect().top + markdownBody.scrollTop;
      suppressObserver = true;
      markdownBody.scrollTo({ top: targetTop - 16, behavior: 'smooth' });
      setActive(id);
      setTimeout(() => { suppressObserver = false; }, 600);
    });
  });
})();
