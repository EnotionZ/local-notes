(function () {
  const container = document.querySelector('.container');
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('mobile-sidebar-toggle');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!container || !sidebar || !toggleBtn || !backdrop) {
    return;
  }

  const mobileMedia = window.matchMedia('(max-width: 768px)');

  function isMobile() {
    return mobileMedia.matches;
  }

  function setOpen(isOpen) {
    container.classList.toggle('mobile-sidebar-open', isOpen);
    toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', isOpen ? 'Close sidebar' : 'Open sidebar');
    toggleBtn.setAttribute('title', isOpen ? 'Close sidebar' : 'Open sidebar');
    toggleBtn.textContent = isOpen ? '✕' : '☰';
    document.body.style.overflow = isOpen && isMobile() ? 'hidden' : '';
  }

  function close() {
    setOpen(false);
  }

  function toggle() {
    if (!isMobile()) {
      return;
    }
    const isOpen = container.classList.contains('mobile-sidebar-open');
    setOpen(!isOpen);
  }

  function syncMode() {
    if (isMobile()) {
      close();
      return;
    }
    close();
  }

  toggleBtn.addEventListener('click', toggle);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      close();
    }
  });

  sidebar.addEventListener('click', function (event) {
    if (!isMobile()) {
      return;
    }
    if (event.target.closest('a')) {
      close();
    }
  });

  if (typeof mobileMedia.addEventListener === 'function') {
    mobileMedia.addEventListener('change', syncMode);
  } else if (typeof mobileMedia.addListener === 'function') {
    mobileMedia.addListener(syncMode);
  }

  syncMode();
})();
