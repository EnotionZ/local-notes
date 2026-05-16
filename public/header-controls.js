(function () {
  const downloadBtn = document.getElementById("download-pdf");
  const menuToggle = document.getElementById("header-menu-toggle");
  const popoverMenu = document.getElementById("header-popover-menu");
  const themeToggle = document.getElementById("theme-toggle");
  const themeToggleLabel = document.getElementById("theme-toggle-label");
  const THEME_KEY = "docs-theme";

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    if (!themeToggle || !themeToggleLabel) return;
    const isDark = theme === "dark";
    themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
    themeToggleLabel.textContent = isDark ? "Light mode" : "Dark mode";
  }

  let savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme !== "dark" && savedTheme !== "light") {
    savedTheme = window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  applyTheme(savedTheme);

  if (downloadBtn) {
    downloadBtn.addEventListener("click", function () {
      window.print();
      if (popoverMenu) popoverMenu.classList.remove("is-open");
      if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      const currentTheme = document.documentElement.getAttribute("data-theme") || document.body.getAttribute("data-theme");
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      localStorage.setItem(THEME_KEY, nextTheme);
    });
  }

  if (!menuToggle || !popoverMenu) return;

  menuToggle.addEventListener("click", function (event) {
    event.stopPropagation();
    const isOpen = popoverMenu.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  document.addEventListener("click", function (event) {
    if (popoverMenu.contains(event.target) || menuToggle.contains(event.target)) return;
    popoverMenu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    popoverMenu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
})();

(function () {
  const controls = document.getElementById("font-size-controls");
  const markdownBody = document.getElementById("markdown-body");
  if (!controls || !markdownBody) return;

  const buttons = controls.querySelectorAll("button[data-size]");
  const FONT_SIZE_KEY = "docs-font-size";
  const sizeMap = {
    small: "14px",
    medium: "17px",
    large: "20px",
  };

  function setActive(size) {
    buttons.forEach((btn) => {
      if (btn.getAttribute("data-size") === size) {
        btn.classList.remove("outline");
        btn.setAttribute("aria-pressed", "true");
      } else {
        btn.classList.add("outline");
        btn.setAttribute("aria-pressed", "false");
      }
    });
  }

  let saved = localStorage.getItem(FONT_SIZE_KEY);
  if (!saved || !sizeMap[saved]) saved = "medium";
  markdownBody.style.fontSize = sizeMap[saved];
  setActive(saved);

  buttons.forEach((btn) => {
    btn.addEventListener("click", function () {
      const size = btn.getAttribute("data-size");
      markdownBody.style.fontSize = sizeMap[size];
      localStorage.setItem(FONT_SIZE_KEY, size);
      setActive(size);
    });
  });
})();
