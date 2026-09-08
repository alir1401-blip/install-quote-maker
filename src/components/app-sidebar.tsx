import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  MapPin,
  Wrench,
  Package,
  PackageCheck,
  Warehouse,
  Truck,
  MapPinned,
  FileText,
  ClipboardList,
  ScrollText,
  Settings,
  LogOut,
  DoorOpen,
  Library,
  Webhook,
  BellRing,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const nav = [
  { title: "Webhooks", to: "/webhooks", icon: Webhook },
  { title: "Tableau de bord", to: "/dashboard", icon: LayoutDashboard },
  { title: "Devis", to: "/quotes", icon: FileText },
  { title: "Relances devis", to: "/quote-reminders", icon: BellRing },
  { title: "Tickets", to: "/tickets", icon: ClipboardList },
  { title: "Clients", to: "/clients", icon: Users },
  { title: "Grands comptes", to: "/grand-accounts", icon: Building2 },
  { title: "Sites", to: "/sites", icon: MapPin },
  { title: "Installations", to: "/installations", icon: Wrench },
  { title: "Pièces", to: "/parts", icon: Package },
  { title: "Commandes", to: "/orders", icon: PackageCheck },
  { title: "Stocks", to: "/storage-locations", icon: Warehouse },
  { title: "Fournisseurs", to: "/suppliers", icon: Truck },
  { title: "SST & carte", to: "/subcontractors", icon: MapPinned },
  { title: "Contrats", to: "/contracts", icon: ScrollText },
  { title: "Documentation", to: "/docs", icon: Library },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
            <DoorOpen className="h-5 w-5" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight">AutoMaintain</span>
            <span className="text-[11px] text-muted-foreground">Devis & maintenance</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const active = path === item.to || path.startsWith(item.to + "/");
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.to} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Paramètres">
              <Link to="/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Paramètres</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start gap-2 text-sidebar-foreground/80"
        >
          <LogOut className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Déconnexion</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
