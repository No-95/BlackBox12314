import type { LucideIcon } from "lucide-react";

export type NavTeamId = "ceo" | "sales" | "content" | "visionist" | "lawyer";

export interface NavItem {
  id: NavTeamId;
  label: string;
  hint?: string;
  icon: LucideIcon;
}
