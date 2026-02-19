import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAdminAuth } from '../state/useAdminAuth';

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAdminAuth();
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            className="md:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label={navOpen ? 'Luk menu' : 'Åbn menu'}
            aria-expanded={navOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {navOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          <Link to="/customers" className="text-lg sm:text-xl font-semibold tracking-tight text-slate-900">
            Replypilot Admin
          </Link>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-100">
            v1
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 text-sm text-slate-600">
          {user && (
            <>
              <span className="hidden sm:inline truncate max-w-[180px]">
                {user.email} · <span className="uppercase tracking-wide text-xs text-slate-500">ADMIN</span>
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
              >
                Log ud
              </button>
            </>
          )}
        </div>
      </header>
      <div className="flex flex-1 relative">
        <nav
          className={[
            'md:flex md:flex-col md:static md:translate-x-0 md:w-56 border-r border-slate-200 bg-white shrink-0',
            'absolute inset-y-0 left-0 z-10 w-56 transform transition-transform duration-200 ease-out',
            navOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
          ].join(' ')}
        >
          <div className="px-4 py-4 space-y-1 text-sm">
            <NavLink
              to="/customers"
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 font-medium transition-colors',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100',
                ].join(' ')
              }
            >
              Kunder
            </NavLink>
            <NavLink
              to="/fonecloud-numbers"
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 font-medium transition-colors',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100',
                ].join(' ')
              }
            >
              Fonecloud-numre
            </NavLink>
            <NavLink
              to="/status"
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 font-medium transition-colors',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100',
                ].join(' ')
              }
            >
              Systemstatus
            </NavLink>
          </div>
        </nav>
        {navOpen && (
          <button
            type="button"
            className="md:hidden fixed inset-0 z-0 bg-black/20"
            onClick={() => setNavOpen(false)}
            aria-label="Luk menu"
          />
        )}
        <main className="flex-1 min-w-0 px-4 sm:px-6 md:px-8 py-4 sm:py-6">{children}</main>
      </div>
    </div>
  );
};

