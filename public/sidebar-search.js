// Sidebar search and keyboard shortcuts for documentation view
const searchInput = document.getElementById('search');
const fileList = document.getElementById('file-list');
if (searchInput && fileList) {
  const minQueryLength = Number(window.__SEARCH_MIN_QUERY_LENGTH__) || 3;
  const SIDEBAR_TREE_KEY = 'docs-open-folders';
  const fileItems = Array.from(fileList.querySelectorAll('.sidebar-file'));
  const folderItems = Array.from(fileList.querySelectorAll('.sidebar-folder'));
  const isSearchResultsPage = window.location.pathname === '/search';
  let searchRequestId = 0;
  let isSearchActive = false;

  function setFolderOpen(folder, shouldOpen) {
    const button = folder.querySelector(':scope > .tree-folder-btn');
    const chevron = button ? button.querySelector('.tree-chevron') : null;
    folder.classList.toggle('open', shouldOpen);
    if (button) {
      button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }
    if (chevron) {
      chevron.textContent = shouldOpen ? '▾' : '▸';
    }
  }

  function persistOpenFolders() {
    if (isSearchActive) return;
    const openFolders = folderItems
      .filter((folder) => folder.classList.contains('open'))
      .map((folder) => folder.dataset.folderPath)
      .filter(Boolean);
    localStorage.setItem(SIDEBAR_TREE_KEY, JSON.stringify(openFolders));
  }

  function applySavedFolderState() {
    let savedOpenFolders = [];
    try {
      savedOpenFolders = JSON.parse(localStorage.getItem(SIDEBAR_TREE_KEY) || '[]');
    } catch (err) {
      savedOpenFolders = [];
    }
    const openSet = new Set(savedOpenFolders);
    folderItems.forEach((folder) => {
      const path = folder.dataset.folderPath || '';
      const wasServerOpened = folder.classList.contains('open');
      setFolderOpen(folder, wasServerOpened || openSet.has(path));
    });
  }

  function sortFoldersByDepthDesc() {
    return [...folderItems].sort((a, b) => {
      const aDepth = (a.dataset.folderPath || '').split('/').length;
      const bDepth = (b.dataset.folderPath || '').split('/').length;
      return bDepth - aDepth;
    });
  }

  function getImmediateChildFolders(folder) {
    const childrenWrapper = folder.querySelector(':scope > .tree-children');
    if (!childrenWrapper) return [];
    return Array.from(childrenWrapper.querySelectorAll(':scope > .sidebar-folder'));
  }

  function updateFolderVisibility(searchTerm) {
    const hasSearchTerm = Boolean(searchTerm);
    const foldersByDepth = sortFoldersByDepthDesc();

    foldersByDepth.forEach((folder) => {
      const hasVisibleFile = Boolean(folder.querySelector('.sidebar-file:not(.search-hidden)'));
      const hasVisibleFolder = getImmediateChildFolders(folder).some((child) => !child.classList.contains('search-hidden'));
      const isVisible = hasVisibleFile || hasVisibleFolder;
      folder.classList.toggle('search-hidden', !isVisible);
      if (hasSearchTerm && isVisible) {
        setFolderOpen(folder, true);
      }
    });
  }

  function ensureFilePath(item) {
    if (item.dataset.path) {
      return item.dataset.path;
    }
    const link = item.querySelector('.tree-file-link');
    if (!link) {
      return '';
    }
    const href = link.getAttribute('href') || '';
    const decoded = decodeURIComponent(href.startsWith('/') ? href.slice(1) : href);
    const path = decoded.endsWith('.md') ? decoded : decoded + '.md';
    item.dataset.path = path;
    return path;
  }

  function normalizeForMatch(str) {
    return str.toLowerCase().replace(/[-_\s]/g, '');
  }

  function applyLocalFilter(searchTerm) {
    isSearchActive = Boolean(searchTerm);
    const normalizedSearch = normalizeForMatch(searchTerm);
    fileItems.forEach((item) => {
      const fileName = item.textContent.toLowerCase();
      const normalizedName = normalizeForMatch(fileName);
      const matches = normalizedName.includes(normalizedSearch);
      item.classList.toggle('search-hidden', !matches);
    });
    if (isSearchActive) {
      updateFolderVisibility(searchTerm);
      return;
    }
    folderItems.forEach((folder) => folder.classList.remove('search-hidden'));
    applySavedFolderState();
  }

  function searchWithApi() {
    const rawTerm = searchInput.value;
    const searchTerm = rawTerm.trim().toLowerCase();
    const requestId = ++searchRequestId;

    if (!searchTerm) {
      applyLocalFilter('');
      return;
    }
    if (searchTerm.length < minQueryLength) {
      applyLocalFilter('');
      return;
    }

    // For sidebar filtering, just use filename-based filtering (faster, more intuitive)
    // Full content search happens when user presses Enter to go to search results page
    applyLocalFilter(searchTerm);
  }

  function debounce(fn, delayMs) {
    let timerId = null;
    return function debounced() {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => fn(), delayMs);
    };
  }

  const debouncedSearch = debounce(searchWithApi, 120);
  
  // On search results page, ensure all sidebar files are visible and folders are open
  if (isSearchResultsPage) {
    fileItems.forEach((item) => item.classList.remove('search-hidden'));
    folderItems.forEach((folder) => folder.classList.remove('search-hidden'));
    // Open all folders on search results page so users can see all files
    folderItems.forEach((folder) => setFolderOpen(folder, true));
  } else {
    // On other pages, restore saved folder state
    applySavedFolderState();
  }
  
  folderItems.forEach((folder) => {
    const button = folder.querySelector(':scope > .tree-folder-btn');
    if (!button) return;
    button.addEventListener('click', () => {
      const isOpen = folder.classList.contains('open');
      setFolderOpen(folder, !isOpen);
      persistOpenFolders();
    });
  });
  searchInput.addEventListener('input', debouncedSearch);
  
  // On search results page, don't auto-filter sidebar on load
  // Only filter if user types in the search box
  if (!isSearchResultsPage && searchInput.value.trim().length >= minQueryLength) {
    debouncedSearch();
  }
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      const rawTerm = searchInput.value.trim();
      if (rawTerm && rawTerm.length >= minQueryLength) {
        e.preventDefault();
        window.location.href = `/search?q=${encodeURIComponent(rawTerm)}`;
      }
    }
  });
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      searchInput.value = '';
      applyLocalFilter('');
      searchInput.blur();
    }
  });
}

// ---------------------------------------------------------------------------
// Keyboard navigation for the full-page search results list (/search)
// ---------------------------------------------------------------------------
(function () {
  if (window.location.pathname !== '/search') return;
  const resultsList = document.getElementById('search-results-list');
  if (!resultsList) return;

  const getItems = () => Array.from(resultsList.querySelectorAll('.search-result-item'));
  let focusedIndex = -1;

  function setFocus(index) {
    const items = getItems();
    items.forEach((item, i) => item.classList.toggle('is-focused', i === index));
    if (index >= 0 && index < items.length) {
      items[index].scrollIntoView({ block: 'nearest' });
    }
    focusedIndex = index;
  }

  document.addEventListener('keydown', function (e) {
    if (document.activeElement === document.getElementById('search')) return;
    const items = getItems();
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocus(Math.min(focusedIndex + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocus(Math.max(focusedIndex - 1, 0));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      const link = items[focusedIndex] && items[focusedIndex].querySelector('.search-result-title a');
      if (link) link.click();
    }
  });

  // Arrow-down from search input → jump to first result.
  const searchInput = document.getElementById('search');
  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchInput.blur();
        setFocus(0);
      }
    });
  }
})();
