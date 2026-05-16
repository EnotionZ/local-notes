// Sidebar collapse logic
(function () {
  const sidebar = document.getElementById("sidebar");
  const sidebarHeader = document.getElementById("sidebar-header");
  const fileListNav = document.getElementById("file-list-nav");
  const searchInput = sidebarHeader.querySelector("#search");
  const toggleBtn = document.getElementById("sidebar-toggle");
  const container = document.querySelector(".container");
  const contentHeaderHome = document.getElementById("content-header-home");
  const SIDEBAR_KEY = "docs-sidebar-collapsed";
  const mobileMedia = window.matchMedia("(max-width: 768px)");
  function setCollapsed(collapsed) {
    if (collapsed) {
      sidebar.style.display = "none";
      container.classList.add("sidebar-hidden");
      toggleBtn.innerText = "»";
      toggleBtn.setAttribute("aria-label", "Expand sidebar");
      toggleBtn.setAttribute("title", "Expand sidebar");
      container.style.gridTemplateColumns = "";
      if (contentHeaderHome) contentHeaderHome.style.display = "";
    } else {
      sidebar.style.display = "";
      container.classList.remove("sidebar-hidden");
      toggleBtn.innerText = "«";
      toggleBtn.setAttribute("aria-label", "Collapse sidebar");
      toggleBtn.setAttribute("title", "Collapse sidebar");
      container.style.gridTemplateColumns = "";
      if (contentHeaderHome) contentHeaderHome.style.display = "none";
    }
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  }
  function applyDesktopStateFromStorage() {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    setCollapsed(saved === "1");
  }

  if (!mobileMedia.matches) {
    applyDesktopStateFromStorage();
  } else {
    sidebar.style.display = "";
    container.classList.remove("sidebar-hidden");
    if (contentHeaderHome) contentHeaderHome.style.display = "none";
  }

  toggleBtn.addEventListener("click", function () {
    const isCollapsed = sidebar.style.display === "none";
    setCollapsed(!isCollapsed);
  });

  function handleViewportModeChange() {
    if (mobileMedia.matches) {
      sidebar.style.display = "";
      container.classList.remove("sidebar-hidden");
      if (contentHeaderHome) contentHeaderHome.style.display = "none";
      return;
    }
    applyDesktopStateFromStorage();
  }

  if (typeof mobileMedia.addEventListener === "function") {
    mobileMedia.addEventListener("change", handleViewportModeChange);
  } else if (typeof mobileMedia.addListener === "function") {
    mobileMedia.addListener(handleViewportModeChange);
  }
})();
