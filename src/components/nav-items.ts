export type NavItem = { href: string; label: string };

/** The site's pages in menu order (FR-001). Adding a page is a one-line change here. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/cv', label: 'CV' },
  { href: '/projects', label: 'Projects' },
  { href: '/assistant', label: 'AI assistant' },
  { href: '/guardrails', label: 'Guardrails' },
  { href: '/how-i-work-with-ai', label: 'How I work with AI' },
  { href: '/evals', label: 'Evals' },
  { href: '/architecture', label: 'Architecture' },
];

/** True when `pathname` is the item's page or one of its sub-pages (for example a case study under /projects). */
export function isCurrent(item: NavItem, pathname: string): boolean {
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
