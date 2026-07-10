import { useEffect, useState } from "react";
import {
  Briefcase,
  Clapperboard,
  Compass,
  PanelLeft,
  PanelLeftClose,
  Scale,
  Settings,
  TrendingUp
} from "lucide-react";
import type { NavItem, NavTeamId } from "../types/nav";

const NAV_ITEMS: NavItem[] = [
  { id: "ceo", label: "CEO", hint: "Strategy & directives", icon: Briefcase },
  { id: "sales", label: "Sales Team", hint: "Outreach & pipeline", icon: TrendingUp },
  { id: "content", label: "Content Creator", hint: "Creative production", icon: Clapperboard },
  { id: "visionist", label: "Bói Toán Tại Hạ", hint: "Dự đoán kịch bản", icon: Compass },
  { id: "lawyer", label: "Lawyer", hint: "Contracts & compliance", icon: Scale }
];

function Tooltip({ label, show }: { label: string; show: boolean }) {
  if (!show) return null;

  return (
    <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100">
      {label}
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-b border-l border-white/10 bg-zinc-900" />
    </span>
  );
}

function NavButton({
  item,
  active,
  collapsed,
  onSelect
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onSelect: (id: NavTeamId) => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(item.id)}
      className={[
        "group relative flex w-full items-center rounded-lg text-left transition-all duration-200 ease-out",
        collapsed ? "justify-center px-0 py-2" : "gap-3 px-2.5 py-2",
        active
          ? "bg-white/[0.08] text-zinc-50"
          : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
      ].join(" ")}
    >
      {active && !collapsed && (
        <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-sky-400" />
      )}

      <span
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors duration-200",
          active
            ? "bg-sky-500/15 text-sky-300"
            : "bg-transparent text-zinc-500 group-hover:text-zinc-300"
        ].join(" ")}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>

      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium leading-tight">{item.label}</span>
          {item.hint && (
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-zinc-500 group-hover:text-zinc-400">
              {item.hint}
            </span>
          )}
        </span>
      )}

      <Tooltip label={item.label} show={collapsed} />
    </button>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState<NavTeamId>("ceo");

  useEffect(() => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "68px" : "260px"
    );
  }, [collapsed]);

  useEffect(() => {
    const onTeamChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ team: NavTeamId }>).detail;
      if (detail?.team && NAV_ITEMS.some((item) => item.id === detail.team)) {
        setActiveId(detail.team);
      }
    };

    window.addEventListener("agentbox:team-changed", onTeamChanged);
    return () => window.removeEventListener("agentbox:team-changed", onTeamChanged);
  }, []);

  const navigate = (id: NavTeamId) => {
    setActiveId(id);
    window.dispatchEvent(
      new CustomEvent("agentbox:navigate", { detail: { team: id } })
    );
  };

  return (
    <aside
      className={[
        "sidebar-shell fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/[0.06] bg-[#0c0c0e] text-zinc-100 shadow-[inset_-1px_0_0_rgba(255,255,255,0.03)] transition-all duration-300 ease-in-out",
        collapsed ? "w-[68px]" : "w-[260px]"
      ].join(" ")}
    >
      <div
        className={[
          "flex h-14 shrink-0 items-center border-b border-white/[0.06]",
          collapsed ? "justify-center px-2" : "justify-between px-3"
        ].join(" ")}
      >
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-semibold tracking-wide text-zinc-100">
              AB
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-zinc-100">Agent Box</p>
              <p className="truncate text-[11px] text-zinc-500">Enterprise workspace</p>
            </div>
          </div>
        )}

        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
        >
          {collapsed ? (
            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {!collapsed && (
          <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            Teams
          </p>
        )}
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={activeId === item.id}
              collapsed={collapsed}
              onSelect={navigate}
            />
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <button
          type="button"
          title={collapsed ? "Settings" : undefined}
          className={[
            "group relative flex w-full items-center rounded-lg text-zinc-400 transition-all duration-200 hover:bg-white/[0.04] hover:text-zinc-200",
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-2.5 py-2"
          ].join(" ")}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 group-hover:text-zinc-300">
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          {!collapsed && <span className="text-[13px] font-medium">Settings</span>}
          <Tooltip label="Settings" show={collapsed} />
        </button>

        <div
          className={[
            "mt-1 flex items-center rounded-lg transition-colors duration-200 hover:bg-white/[0.04]",
            collapsed ? "justify-center px-0 py-2" : "gap-3 px-2.5 py-2"
          ].join(" ")}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-500/10 text-[10px] font-semibold text-emerald-300">
            OP
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-zinc-200">Operator</p>
              <p className="truncate text-[11px] text-zinc-500">HDPHoldings</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
