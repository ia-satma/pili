import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Table2,
  BarChart3,
  History,
  Upload,
  MessageSquare,
  ChevronRight,
  Users,
  LogIn,
  LogOut,
  Layers,
  AlertTriangle,
  FileSpreadsheet,
  UsersRound,
  Mail,
  Settings,
  Brain,
  Activity,
  Grid3X3,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

const mainNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    description: "Vista general",
  },
  {
    title: "Smart Grid",
    url: "/project-master",
    icon: Grid3X3,
    description: "Editor de proyectos",
  },
  {
    title: "Limpieza de Datos",
    url: "/admin/data-cleaning",
    icon: Activity,
    description: "Validación y corrección",
  },
  {
    title: "Proyectos",
    url: "/projects",
    icon: Table2,
  },
  {
    title: "Iniciativas",
    url: "/initiatives",
    icon: Layers,
  },
  {
    title: "Indicadores",
    url: "/indicators",
    icon: BarChart3,
  },
  {
    title: "Historial",
    url: "/history",
    icon: History,
  },
  {
    title: "Alertas",
    url: "/alerts",
    icon: AlertTriangle,
  },
];

const managementItems = [
  {
    title: "Cargar Excel",
    url: "/upload",
    icon: Upload,
    requiredRole: "editor" as const,
  },
  {
    title: "Exportar",
    url: "/exports",
    icon: FileSpreadsheet,
    requiredRole: null,
  },
  {
    title: "Comité",
    url: "/committee",
    icon: UsersRound,
    requiredRole: null,
  },
  {
    title: "Chasers",
    url: "/chasers",
    icon: Mail,
    requiredRole: null,
  },
  {
    title: "Torre de Control",
    url: "/outputs",
    icon: Activity,
    requiredRole: null,
  },
  {
    title: "PMO Bot",
    url: "/chat",
    icon: MessageSquare,
    requiredRole: null,
  },
  {
    title: "Orquestador",
    url: "/orchestrator",
    icon: Brain,
    requiredRole: "editor" as const,
  },
];

const adminItems = [
  {
    title: "Usuarios",
    url: "/admin/users",
    icon: Users,
  },
  {
    title: "Sistema",
    url: "/system",
    icon: Settings,
  },
];

function getRoleBadgeVariant(role: string): "destructive" | "default" | "secondary" {
  switch (role) {
    case "admin":
      return "destructive";
    case "editor":
      return "default";
    default:
      return "secondary";
  }
}

function getRoleLabel(role: string): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "editor":
      return "Editor";
    default:
      return "Viewer";
  }
}

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user, isLoading, isAuthenticated, isAdmin, isEditor } = useAuth();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      window.location.reload();
    },
  });

  const handleLogin = () => {
    setLocation("/login");
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const getUserInitials = () => {
    if (!user) return "?";
    const first = user.firstName?.[0] || "";
    const last = user.lastName?.[0] || "";
    return (first + last).toUpperCase() || user.email?.[0]?.toUpperCase() || "?";
  };

  const getUserName = () => {
    if (!user) return "";
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.email || "";
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight">PMO Dashboard</span>
            <span className="text-xs text-muted-foreground">Mejora Continua</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-4 py-2">
            Navegación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "w-full",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-4 py-2">
            Gestión
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {managementItems.map((item) => {
                const isActive = location === item.url;
                const hasAccess = !item.requiredRole ||
                  (item.requiredRole === "editor" && isEditor);

                if (!hasAccess) return null;

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={cn(
                        "w-full",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                      )}
                    >
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-4 py-2">
              Administración
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const isActive = location === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        className={cn(
                          "w-full",
                          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                        )}
                      >
                        <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          {isActive && <ChevronRight className="ml-auto h-4 w-4" />}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {isLoading ? (
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ) : isAuthenticated && user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8" data-testid="avatar-user">
                <AvatarImage src={user.profileImageUrl || undefined} alt={getUserName()} />
                <AvatarFallback className="text-xs">{getUserInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate" data-testid="text-user-name">
                  {getUserName()}
                </span>
                <Badge
                  variant={getRoleBadgeVariant(user.role)}
                  className="w-fit text-[10px] px-1.5 py-0"
                  data-testid="badge-user-role"
                >
                  {getRoleLabel(user.role)}
                </Badge>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="w-full"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleLogin}
            className="w-full"
            data-testid="button-login"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Iniciar sesión
          </Button>
        )}

        <div className="mt-4 pt-2 border-t border-sidebar-border text-center">
          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-700 border-green-200 hover:bg-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
            v2.1 - PMO Bot: Tags Active
          </Badge>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
