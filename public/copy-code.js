/**
 * Double-click / double-tap to copy code blocks and inline code.
 * Shows a brief toast notification on successful copy.
 * Also adds a hover copy button on <pre> blocks (desktop).
 */
(function () {
  'use strict';

  // --- Toast ---

  function createToast() {
    const toast = document.createElement('div');
    toast.id = 'copy-toast';
    toast.className = 'copy-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.display = 'none';
    document.body.appendChild(toast);
    return toast;
  }

  const toast = createToast();
  let toastTimer = null;
  // Skip toast on touch-primary devices — the OS already shows a native
  // "Copied to clipboard" notification.
  const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;

  function showToast(text) {
    if (isTouchPrimary) return;

    toast.textContent = text;
    toast.style.display = 'block';
    // Force reflow so the hide→show transition fires
    void toast.offsetHeight;
    toast.classList.add('is-visible');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
      // Hide after transition completes (300ms)
      setTimeout(function () {
        toast.style.display = 'none';
      }, 300);
    }, 1800);
  }

  // --- Clipboard helper ---

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('Copied to clipboard');
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard');
    } catch (err) {
      // Silent fail — clipboard not available
    }
    document.body.removeChild(textarea);
  }

  // --- Double-click copy (existing) ---

  function getCodeText(el) {
    if (el.tagName === 'PRE') {
      return el.textContent;
    }
    if (el.tagName === 'CODE' && el.closest('pre')) {
      return el.closest('pre').textContent;
    }
    if (el.tagName === 'CODE') {
      return el.textContent;
    }
    return null;
  }

  document.addEventListener('dblclick', function (e) {
    const markdownBody = document.getElementById('markdown-body');
    if (!markdownBody || !markdownBody.contains(e.target)) return;

    const target = e.target.closest('pre, code');
    if (!target) return;

    const text = getCodeText(target);
    if (!text) return;

    copyTextToClipboard(text);
  });

  // --- Hover copy buttons on <pre> blocks ---

  function addCopyButtons() {
    const markdownBody = document.getElementById('markdown-body');
    if (!markdownBody) return;

    const preBlocks = markdownBody.querySelectorAll('pre');
    preBlocks.forEach(function (pre) {
      // Skip if button already added (e.g. on hot-reload)
      if (pre.querySelector('.copy-block-btn')) return;

      // Don't show the button on mermaid diagrams
      if (pre.querySelector('.mermaid') || pre.textContent.trim().startsWith('mermaid')) return;

      var btn = document.createElement('button');
      btn.className = 'copy-block-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Copy code block');
      btn.setAttribute('title', 'Copy code block');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        copyTextToClipboard(pre.textContent);
      });
      pre.appendChild(btn);
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addCopyButtons);
  } else {
    addCopyButtons();
  }
})();
