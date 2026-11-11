'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isCurrent, type NavItem } from './nav-items';

/**
 * A menu link that marks the current page with aria-current. It is a client component only so it
 * can read the pathname; the link itself is server-rendered and works without JavaScript.
 */
export function NavLink({ item, className }: { item: NavItem; className?: string }) {
  const current = isCurrent(item, usePathname());
  return (
    <Link
      href={item.href}
      aria-current={current ? 'page' : undefined}
      className={`${className ?? ''} ${current ? 'font-semibold underline underline-offset-4' : ''}`}
    >
      {item.label}
    </Link>
  );
}
