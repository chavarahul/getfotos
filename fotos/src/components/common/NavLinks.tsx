import { NavLink, useLocation } from 'react-router-dom';
import { Home, Image as ImageIcon, Settings } from 'lucide-react';
import clsx from 'clsx';

interface NavLinksProps {}

interface NavLinkItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export default function NavLinks(_props: NavLinksProps = {}) {
  const location = useLocation();
  const pathname = location.pathname;

  const links: NavLinkItem[] = [
    { path: '/dashboard', label: 'Album', icon: Home },
    { path: '/connect', label: 'Connect', icon: ImageIcon },
    // { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const linkClasses = (path: string, isActive: boolean): string =>
    clsx(
      'flex items-center gap-3 rounded-[6px] px-3 py-2 text-black hover:bg-gray-200/30 transition-colors',
      { 'bg-gray-300/40': isActive || pathname === path }
    );

  return (
    <>
      {links.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) => linkClasses(path, isActive)}
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </>
  );
}