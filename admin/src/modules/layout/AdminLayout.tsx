import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAdminAuth } from '../state/useAdminAuth';

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAdminAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <Link to="/customers" className="text-xl font-semibold tracking-tight">
            Replypilot Admin
          </Link>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-100">
            v1
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          {user && (
            <>
              <span className="hidden sm:inline">
                {user.email} · <span className="uppercase tracking-wide text-xs">ADMIN</span>
              </span>
              <button
                onClick={logout}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Log ud
              </button>
            </>
          )}
        </div>
      </header>
      <div className="flex flex-1">
        <nav className="w-56 border-r bg-white/80 backdrop-blur-sm">
          <div className="px-4 py-4 space-y-1 text-sm">
            <NavLink
              to="/customers"
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 rounded-md px-3 py-2 font-medium',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100',
                ].join(' ')
              }
            >
              Kunder
            </NavLink>
            <NavLink
              to="/status"
              className={({ isActive }) =>
                [
                  'flex items-center gap-2 rounded-md px-3 py-2 font-medium',
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
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
};

