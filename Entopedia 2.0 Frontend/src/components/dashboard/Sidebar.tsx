"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-actions";
import {
  BookOpen,
  Bug,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Target,
  Database,
  FlaskConical,
  History,
  House,
  LayoutGrid,
  LogOut,
  Radio,
  Send,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

// Items without an href are pages that don't exist yet.
type NavItem = { label: string; icon: LucideIcon; href?: string };

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: "Intelligence",
    items: [
      { label: "Dashboard", icon: House, href: "/" },
      {
        label: "Competitor Intelligence",
        icon: Target,
        href: "/competitor-intelligence",
      },
      {
        label: "Patent Sheet Analyser",
        icon: BookOpen,
        href: "/patent-sheet-analyser",
      },
      {
        label: "Regulatory & Actives",
        icon: ShieldCheck,
        href: "/regulatory-actives",
      },
      { label: "News", icon: Radio, href: "/news" },
      { label: "Deals & Invest.", icon: ChartColumn, href: "/deals-investments" },
    ],
  },
  {
    title: "R&D & Claims",
    items: [
      { label: "Claim Studio AI", icon: FlaskConical, href: "/claim-studio" },
      { label: "Claims Evidence", icon: ClipboardCheck, href: "/claims-evidence" },
      { label: "Knowledge Hub", icon: Database, href: "/knowledge-hub" },
      { label: "Pest Vision", icon: Bug, href: "/pest-vision" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Newsletter", icon: Send, href: "/newsletter" },
      { label: "Deliverables", icon: LayoutGrid, href: "/deliverables" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Admin", icon: Users, href: "/admin" },
      { label: "Audit & Provenance", icon: History, href: "/audit" },
    ],
  },
];

function NavLink({
  label,
  icon: Icon,
  href,
  collapsed,
  onNavigate,
}: NavItem & { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = href !== undefined && pathname === href;
  return (
    <Link
      href={href ?? "#"}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex items-center rounded-lg text-[0.9375rem] transition-colors ${
        collapsed ? "mx-auto size-9 justify-center" : "gap-3 px-3 py-2"
      } ${
        active
          ? "bg-brand text-white"
          : "text-white/80 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <span className={collapsed ? "sr-only" : undefined}>{label}</span>
    </Link>
  );
}

// Profile row; hover (or tap) opens Settings / Log out beside the sidebar.
function ProfileMenu({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const itemClass =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.9375rem] transition-colors";

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? "Account menu" : undefined}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center rounded-lg text-left transition-colors hover:bg-white/5 ${
          collapsed ? "justify-center py-1" : "gap-3 py-2 pr-2 pl-3"
        } ${open ? "bg-white/5" : ""}`}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-ink">
          S
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-white">
              Skyquest Intelligence
            </span>
            <ChevronRight className="size-4 shrink-0 text-white/60" />
          </>
        )}
      </button>

      {open && (
        // Padding (not margin) bridges the gap so the pointer can reach the menu.
        // Opens above the row in the mobile drawer, beside it on desktop.
        <div className="absolute bottom-full left-0 z-50 pb-2 lg:bottom-0 lg:left-full lg:pb-0 lg:pl-6">
          <div
            role="menu"
            className="w-44 rounded-xl border border-white/10 bg-[#33463f] p-1.5 shadow-xl shadow-black/30"
          >
            <Link
              role="menuitem"
              href="/settings"
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
              className={`${itemClass} text-white/85 hover:bg-white/10 hover:text-white`}
            >
              <Settings className="size-4" strokeWidth={1.75} />
              Settings
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                className={`${itemClass} w-full text-left text-red-400 hover:bg-red-500/15 hover:text-red-300`}
              >
                <LogOut className="size-4" strokeWidth={1.75} />
                Log out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Desktop: sticky column that can collapse to icons.
// Below lg: a slide-in drawer opened from the top bar's menu button.
export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const [collapsedPref, setCollapsed] = useState(false);
  // The drawer always shows full labels.
  const collapsed = collapsedPref && !mobileOpen;

  return (
    <>
      {mobileOpen && (
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
    <aside
      className={`fixed top-2 left-2 z-50 flex h-[calc(100dvh-1rem)] shrink-0 flex-col rounded-xl bg-ink transition-[width,translate] duration-200 lg:sticky lg:left-auto lg:z-30 lg:translate-x-0 ${
        collapsed ? "w-16" : "w-64"
      } ${mobileOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"}`}
    >
      <div
        className={`flex items-center py-4 ${
          collapsed ? "justify-center" : "justify-between px-4"
        }`}
      >
        {collapsed ? (
          <button
            type="button"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            onClick={() => setCollapsed(false)}
            className="grid size-8 place-items-center rounded-lg bg-brand transition-opacity hover:opacity-80"
          >
            <Bug className="size-4 text-white" strokeWidth={1.75} />
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-brand">
              <Bug className="size-4 text-white" strokeWidth={1.75} />
            </span>
            <span className="font-heading text-lg font-semibold text-white">
              Entopedia
            </span>
          </div>
        )}
        {!collapsed && (
          <>
            <button
              type="button"
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed(true)}
              className="hidden text-white/60 transition-colors hover:text-white lg:block"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Close menu"
              onClick={onClose}
              className="text-white/60 transition-colors hover:text-white lg:hidden"
            >
              <X className="size-5" />
            </button>
          </>
        )}
      </div>

      <nav
        className={`scrollbar-none min-h-0 flex-1 overflow-y-auto pb-4 ${
          collapsed ? "px-2" : "px-3"
        }`}
      >
        {sections.map((section) => (
          <div
            key={section.title}
            className={
              collapsed
                ? "mt-3 border-t border-white/10 pt-3 first:mt-1 first:border-t-0 first:pt-0"
                : "mt-5 first:mt-1"
            }
          >
            <p
              className={
                collapsed
                  ? "sr-only"
                  : "px-3 pb-2 font-heading text-[0.8125rem] font-semibold tracking-[0.12em] text-white uppercase"
              }
            >
              {section.title}
            </p>
            <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
              {section.items.map((item) => (
                <li key={item.label}>
                  <NavLink {...item} collapsed={collapsed} onNavigate={onClose} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className={`border-t border-white/10 py-3 ${collapsed ? "px-2" : "px-3"}`}
      >
        <ProfileMenu collapsed={collapsed} onNavigate={onClose} />
      </div>
      {collapsed && (
        <div className="border-t border-white/10 px-2 py-3">
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={() => setCollapsed(false)}
            className="mx-auto grid size-9 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </aside>
    </>
  );
}
