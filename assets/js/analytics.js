// Google Analytics 4 for every page on the site (landing page and tools).
// Paste your Measurement ID from GA ▸ Admin ▸ Data streams ▸ (your web stream).
(function () {
  var GA_ID = "G-WQ4Z86XBLL";

  // Stays off until a real ID is set, and never counts local previews.
  if (!/^G-[A-Z0-9]+$/.test(GA_ID) || GA_ID === "G-XXXXXXXXXX") return;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:") return;

  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID);
})();
