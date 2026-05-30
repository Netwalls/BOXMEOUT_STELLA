'use client';

import Link from 'next/link';
import { useState } from 'react';

type NavLink = { href: string; label: string };

export function HeaderMobileNav({
  links,
  pathname,
}: {
  links: NavLink[];
  pathname: string;
}): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);

  const linkClass = (href: string) =>
    `hover:text-white transition-colors ${pathname === href ? 'text-white font-semibold border-b-2 border-amber-500 pb-0.5' : 'text-gray-400'}`;

  return (
    <>
      <button
        className="md:hidden flex items-center justify-center w-11 h-11 text-gray-400 hover:text-white"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Toggle menu"
        aria-expanded={menuOpen}
      >
        ☰
      </button>

      {menuOpen && (
        <nav
          className="md:hidden bg-gray-950 border-t border-gray-800 px-4 py-2 flex flex-col text-sm"
          aria-label="Mobile navigation"
        >
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center min-h-[44px] ${linkClass(href)}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
