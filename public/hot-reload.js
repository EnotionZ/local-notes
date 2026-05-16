/**
 * Hot reload client - connects to SSE endpoint and replaces content when markdown files change.
 * Only active in development mode (when running via npm run dev).
 * The server-side endpoint is only available when NODE_ENV !== 'production', so this will
 * gracefully fail if accessed in production or if the endpoint is unavailable.
 */
(function() {
  'use strict';

  // Only enable hot reload in development (localhost or *.dph.am hostnames)
  const hostname = window.location.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.endsWith('.dph.am')) {
    return;
  }

  let eventSource = null;
  let reconnectTimeout = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const RECONNECT_DELAY = 2000;

  /**
   * Get the current page's markdown file path from the URL.
   * Returns null if not a markdown page (e.g., homepage, search).
   */
  function getCurrentPagePath() {
    const pathname = window.location.pathname;
    if (pathname === '/' || pathname === '/index.html' || pathname === '/search') {
      return null; // Homepage or search page - can't hot reload these
    }
    // Remove leading slash and decode
    let relPath = decodeURIComponent(pathname.slice(1));
    // Add .md extension if not present
    if (!relPath.endsWith('.md')) {
      relPath = relPath + '.md';
    }
    return relPath;
  }

  /**
   * Normalize a file path for comparison.
   * Removes 'Notes/' prefix if present and normalizes separators.
   */
  function normalizePath(filePath) {
    if (!filePath) return '';
    // Remove 'Notes/' prefix if present
    let normalized = filePath.replace(/^Notes\//, '');
    // Normalize path separators
    normalized = normalized.replace(/\\/g, '/');
    return normalized;
  }

  /**
   * Fetch updated content and replace the markdown body.
   */
  async function updateContent(filePath) {
    const currentPath = getCurrentPagePath();
    if (!currentPath) {
      // Not a markdown page, fall back to full reload
      console.log('[Hot reload] Not a markdown page, reloading...');
      window.location.reload();
      return;
    }

    // Normalize paths for comparison (server sends with Notes/ prefix, client doesn't)
    const normalizedFilePath = normalizePath(filePath);
    const normalizedCurrentPath = normalizePath(currentPath);
    
    // Only update if the changed file matches the current page
    if (normalizedFilePath !== normalizedCurrentPath) {
      console.log('[Hot reload] File changed but not current page:', filePath, 'vs', currentPath);
      return;
    }

    try {
      const scrollPosition = window.scrollY;
      const response = await fetch(`/api/content?path=${encodeURIComponent(currentPath)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const markdownBody = document.getElementById('markdown-body');
      
      if (!markdownBody) {
        console.warn('[Hot reload] Markdown body not found, reloading...');
        window.location.reload();
        return;
      }

      // Replace content
      markdownBody.innerHTML = data.html;
      
      // Update page title if changed
      if (data.title && document.title !== data.title) {
        document.title = data.title;
      }

      // Update markdown body class for TOC
      if (data.hasToc) {
        markdownBody.classList.add('has-toc');
      } else {
        markdownBody.classList.remove('has-toc');
      }

      // Re-initialize TOC highlighting if present
      if (data.hasToc) {
        // Re-run TOC initialization
        const tocLinks = Array.from(document.querySelectorAll('.toc-link'));
        if (tocLinks.length) {
          const markdownBody = document.getElementById('markdown-body');
          if (markdownBody) {
            const details = document.querySelector('.toc-details');
            if (details) {
              const STORAGE_KEY = 'toc-open';
              const saved = localStorage.getItem(STORAGE_KEY);
              if (saved === 'false') details.removeAttribute('open');
              details.addEventListener('toggle', () => {
                localStorage.setItem(STORAGE_KEY, details.open ? 'true' : 'false');
              });
            }
            const headingIds = tocLinks.map((a) => a.dataset.headingId).filter(Boolean);
            const headings = headingIds.map((id) => document.getElementById(id)).filter(Boolean);
            function setActive(id) {
              tocLinks.forEach((a) => {
                a.classList.toggle('toc-link-active', a.dataset.headingId === id);
              });
            }
            const intersecting = new Set();
            let suppressObserver = false;
            const observer = new IntersectionObserver(
              (entries) => {
                entries.forEach((e) => {
                  if (e.isIntersecting) intersecting.add(e.target.id);
                  else intersecting.delete(e.target.id);
                });
                if (suppressObserver) return;
                const topmost = headings.find((h) => intersecting.has(h.id));
                if (topmost) setActive(topmost.id);
              },
              { root: markdownBody, rootMargin: '0px 0px -80% 0px', threshold: 0 }
            );
            headings.forEach((h) => observer.observe(h));
            const initialHash = window.location.hash.slice(1);
            const initialTarget = initialHash && document.getElementById(initialHash);
            if (initialTarget) {
              const targetTop = initialTarget.getBoundingClientRect().top - markdownBody.getBoundingClientRect().top + markdownBody.scrollTop;
              markdownBody.scrollTop = targetTop - 16;
              setActive(initialHash);
            } else if (headings.length) {
              setActive(headings[0].id);
            }
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
          }
        }
      }

      // Re-initialize Mermaid diagrams if present
      if (data.hasMermaid && window.mermaid) {
        window.mermaid.initialize({ startOnLoad: true });
        const mermaidElements = markdownBody.querySelectorAll('.language-mermaid, code.language-mermaid');
        mermaidElements.forEach((el) => {
          const parent = el.parentElement;
          if (parent && parent.tagName === 'PRE') {
            const content = el.textContent || el.innerText;
            const id = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            parent.outerHTML = '<div class="mermaid">' + content + '</div>';
          }
        });
        window.mermaid.run();
      }

      // Re-run Prism syntax highlighting
      if (window.Prism) {
        window.Prism.highlightAllUnder(markdownBody);
      }

      // Restore scroll position
      window.scrollTo(0, scrollPosition);

      console.log('[Hot reload] Content updated');
    } catch (err) {
      console.error('[Hot reload] Failed to update content:', err);
      // Fall back to full reload on error
      window.location.reload();
    }
  }

  function connect() {
    if (eventSource) {
      eventSource.close();
    }

    try {
      eventSource = new EventSource('/api/hot-reload');

      eventSource.onopen = function() {
        reconnectAttempts = 0;
        console.log('[Hot reload] Connected');
      };

      eventSource.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'file-changed') {
            console.log('[Hot reload] File changed:', data.path);
            // Update content after a short delay to allow server to process the change
            setTimeout(() => {
              updateContent(data.path);
            }, 100);
          }
        } catch (err) {
          // Ignore parse errors
        }
      };

      eventSource.onerror = function(err) {
        console.error('[Hot reload] Connection error:', err);
        eventSource.close();
        eventSource = null;

        // Attempt to reconnect
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          reconnectTimeout = setTimeout(() => {
            console.log(`[Hot reload] Reconnecting (attempt ${reconnectAttempts})...`);
            connect();
          }, RECONNECT_DELAY);
        } else {
          console.warn('[Hot reload] Max reconnection attempts reached. Hot reload disabled.');
        }
      };
    } catch (err) {
      console.error('[Hot reload] Failed to create EventSource:', err);
    }
  }

  // Connect when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect);
  } else {
    connect();
  }

  // Clean up on page unload
  window.addEventListener('beforeunload', function() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  });
})();
