/* The page's scrollbar stays out of sight until the mouse reaches it, at the
   right edge of the window. CSS cannot tell: over a page, :hover on <html> is
   true everywhere. Only a class for the stylesheet (index.css); scrolling and
   everything else are the browser's. */
const EDGE_PX = 20;
const CLASS = 'page-scrollbar-on';

export function watchPageScrollbar() {
  const root = document.documentElement;
  document.addEventListener('mousemove', (e) => {
    root.classList.toggle(CLASS, window.innerWidth - e.clientX <= EDGE_PX);
  }, { passive: true });
  root.addEventListener('mouseleave', () => root.classList.remove(CLASS));
}
