import { useState } from 'react';
import { MemoryChipIcon } from './MemoryChipIcon';

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/memories', label: 'Memories' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/admin/api-tokens', label: 'API Tokens' },
];

export function Sidebar({ currentPath }: { currentPath: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } border-r border-outline-variant bg-card flex flex-col transition-all duration-200`}
    >
      <div className="flex items-center gap-3 border-b border-outline-variant px-4 h-14">
        <MemoryChipIcon className="w-6 h-6 text-primary shrink-0" />
        {!collapsed && <span className="font-semibold text-foreground text-sm">Sechel</span>}
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const active = currentPath === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-none transition-colors ${
                active
                  ? 'bg-primary/10 text-primary border-l-2 border-primary'
                  : 'text-muted-foreground hover:bg-surface hover:text-foreground'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0 w-4 h-4" /> {/* Placeholder icon spot */}
              {!collapsed && <span>{item.label}</span>}
            </a>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="border-t border-outline-variant p-4 text-xs text-muted-foreground hover:text-foreground"
      >
        {collapsed ? '→' : '◄ Collapse'}
      </button>
    </aside>
  );
}
