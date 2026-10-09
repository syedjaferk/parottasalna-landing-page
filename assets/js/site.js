document.getElementById("yr").textContent = new Date().getFullYear();
const io = "IntersectionObserver" in window && new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach((el) => io ? io.observe(el) : el.classList.add("in"));
const moreBtn = document.getElementById("more-reviews");
if (moreBtn) moreBtn.addEventListener("click", () => {
  const list = document.getElementById("review-list");
  const open = list.classList.toggle("open");
  moreBtn.setAttribute("aria-expanded", open);
  moreBtn.textContent = open ? "Show fewer reviews" : moreBtn.dataset.label;
});
if (moreBtn) moreBtn.dataset.label = moreBtn.textContent;
document.querySelectorAll(".vid .frame").forEach((btn) => btn.addEventListener("click", () => {
  const f = document.createElement("iframe");
  f.src = btn.dataset.src; f.title = btn.getAttribute("aria-label");
  f.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  f.allowFullscreen = true;
  const box = document.createElement("div");
  box.className = "frame";
  box.appendChild(f);
  btn.replaceWith(box);
}, { once: true }));
const nav = document.querySelector(".nav"), menuBtn = document.querySelector(".menu-btn");
menuBtn.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open);
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});
document.querySelectorAll(".nav-links a").forEach((a) => a.addEventListener("click", () => {
  nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false");
}));
const drop = document.querySelector(".nav-drop"), dropBtn = drop.querySelector(".drop-btn");
dropBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  dropBtn.setAttribute("aria-expanded", drop.classList.toggle("open"));
});
document.addEventListener("click", (e) => {
  if (!drop.contains(e.target)) { drop.classList.remove("open"); dropBtn.setAttribute("aria-expanded", "false"); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && drop.classList.contains("open")) { drop.classList.remove("open"); dropBtn.setAttribute("aria-expanded", "false"); dropBtn.focus(); }
});
