import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpenText,
  Brain,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Menu,
  MessageCircle,
  NotebookTabs,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { Dialog } from "../components";
import { RouteReveal } from "./RouteReveal";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface AppShellProps {
  children?: ReactNode;
  navigation?: readonly NavItem[];
  brandName?: string;
  brandSubtitle?: string;
  footer?: ReactNode;
}

export const DEFAULT_NAVIGATION: readonly NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/notebooks", label: "Notebooks", icon: NotebookTabs },
  { to: "/study-actions", label: "Study actions", icon: Sparkles },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/memory", label: "Learner memory", icon: Brain },
  { to: "/system", label: "System", icon: Settings },
];

function Navigation({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: readonly NavItem[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <ul>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  ["app-nav__link", isActive ? "is-active" : ""]
                    .filter(Boolean)
                    .join(" ")
                }
                title={collapsed ? item.label : undefined}
                onClick={onNavigate}
              >
                <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                <span className={collapsed ? "visually-hidden" : ""}>
                  {item.label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({
  children,
  navigation = DEFAULT_NAVIGATION,
  brandName = "Study Companion",
  brandSubtitle = "Your local learning workspace",
  footer,
}: AppShellProps) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
    if (previousPath.current !== location.pathname) {
      mainRef.current?.focus();
      previousPath.current = location.pathname;
    }
  }, [location.pathname]);

  return (
    <div
      className={[
        "app-shell",
        sidebarCollapsed ? "app-shell--collapsed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand__mark" aria-hidden="true">
            <BookOpenText size={24} />
          </span>
          <div className={sidebarCollapsed ? "visually-hidden" : "app-brand__copy"}>
            <span className="app-brand__name">{brandName}</span>
            <span className="app-brand__subtitle">{brandSubtitle}</span>
          </div>
        </div>

        <Navigation items={navigation} collapsed={sidebarCollapsed} />

        <div className="app-sidebar__footer">
          {sidebarCollapsed ? null : footer}
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={19} aria-hidden="true" />
            ) : (
              <ChevronLeft size={19} aria-hidden="true" />
            )}
            <span className={sidebarCollapsed ? "visually-hidden" : ""}>
              Collapse sidebar
            </span>
          </button>
        </div>
      </aside>

      <header className="app-topbar">
        <button
          type="button"
          className="icon-button"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
        <div className="app-topbar__brand">
          <BookOpenText size={22} aria-hidden="true" />
          <span>{brandName}</span>
        </div>
      </header>

      <Dialog
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={brandName}
        description={brandSubtitle}
        className="app-drawer"
      >
        <Navigation items={navigation} onNavigate={() => setDrawerOpen(false)} />
        {footer ? <div className="app-drawer__footer">{footer}</div> : null}
      </Dialog>

      <main id="main-content" ref={mainRef} className="app-main" tabIndex={-1}>
        <RouteReveal key={location.key}>{children ?? <Outlet />}</RouteReveal>
      </main>
    </div>
  );
}
