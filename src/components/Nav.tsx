import { NAV_ITEMS } from './nav-items';
import { NavLink } from './NavLink';

const linkClass = 'block rounded px-2 py-1 text-foreground no-underline hover:underline';

/**
 * The main menu. On small screens it collapses into <details>/<summary>, which opens and closes
 * without JavaScript (FR-029). Only one of the two lists is displayed at a time, so assistive
 * technology sees a single set of links.
 */
export function Nav() {
  return (
    <nav aria-label="Main">
      <ul className="hidden flex-wrap gap-1 text-sm lg:flex">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <NavLink item={item} className={linkClass} />
          </li>
        ))}
      </ul>

      <details className="relative lg:hidden">
        <summary className="cursor-pointer rounded border border-border px-3 py-1 text-sm">Menu</summary>
        <ul className="absolute right-0 z-10 mt-2 w-56 rounded border border-border bg-background p-2 shadow-lg">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink item={item} className={`${linkClass} py-2`} />
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
