import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/customers', label: 'Buyers (Customers)', icon: '🧑\u200d💼' },
  { to: '/suppliers', label: 'Suppliers', icon: '🏭' },
  { to: '/materials', label: 'Raw Materials', icon: '🧵' },
  { to: '/products', label: 'Products', icon: '🏺' },
  { to: '/production-orders', label: 'Production', icon: '⚙️' },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: '🧾' },
  { to: '/customer-purchase-orders', label: 'Customer POs', icon: '📋' },
  { to: '/proforma-invoices', label: 'Proforma Invoices', icon: '📄' },
  { to: '/sales-orders', label: 'Export / Sales Orders', icon: '🚢' },
  { to: '/shipments', label: 'Shipments', icon: '📦' },
  { to: '/containers', label: 'Containers & Shipping', icon: '🚛' },
  { to: '/invoices', label: 'Invoices & Payments', icon: '💰' },
  { to: '/users', label: 'Users', icon: '👥', adminOnly: true },
  { to: '/company-settings', label: 'Company Settings', icon: '⚙️', adminOnly: true },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-stone-100 text-stone-800">
      <aside className="w-64 shrink-0 bg-stone-900 text-stone-100 flex flex-col print:hidden">
        <div className="px-5 py-5 border-b border-stone-700">
          <div className="text-lg font-bold leading-tight">Akbar Handicrafts</div>
          <div className="text-xs text-stone-400">Manufacturing &amp; Export CRM</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === 'admin')
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                    isActive
                      ? 'bg-amber-600 text-white font-medium'
                      : 'text-stone-300 hover:bg-stone-800 hover:text-white'
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
        </nav>
        <div className="px-5 py-4 border-t border-stone-700 text-xs text-stone-400">
          Signed in as
          <div className="text-stone-100 text-sm font-medium">{user?.name}</div>
          <div className="uppercase tracking-wide text-amber-500">{user?.role}</div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full rounded bg-stone-700 hover:bg-stone-600 text-stone-100 py-1.5 text-sm"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto print:overflow-visible">
        <div className="max-w-7xl mx-auto p-6 print:p-0 print:max-w-none">{children}</div>
      </main>
    </div>
  );
}
