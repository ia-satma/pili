import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { FilterProvider } from "@/contexts/filter-context";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import Indicators from "@/pages/indicators";
import History from "@/pages/history";
import Upload from "@/pages/upload";
import Chat from "@/pages/chat";
import AdminUsers from "@/pages/admin-users";
import Login from "@/pages/login";
import Initiatives from "@/pages/initiatives";
import InitiativeDetail from "@/pages/initiative-detail";
import Alerts from "@/pages/alerts";
import Exports from "@/pages/exports";
import Committee from "@/pages/committee";
import CommitteeDetail from "@/pages/committee-detail";
import Chasers from "@/pages/chasers";
import System from "@/pages/system";
import Orchestrator from "@/pages/orchestrator";
import Outputs from "@/pages/outputs";
import DataCleaning from "@/pages/data-cleaning";
import ProjectMaster from "@/pages/project-master";
import ProjectPage from "@/pages/project-page";

function ProtectedRouter() {
  // TEMP: Auth disabled for testing
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/projects" component={Projects} />
      <Route path="/indicators" component={Indicators} />
      <Route path="/history" component={History} />
      <Route path="/upload" component={Upload} />
      <Route path="/chat" component={Chat} />
      <Route path="/initiatives" component={Initiatives} />
      <Route path="/initiatives/:id" component={InitiativeDetail} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/exports" component={Exports} />
      <Route path="/committee" component={Committee} />
      <Route path="/committee/:id" component={CommitteeDetail} />
      <Route path="/chasers" component={Chasers} />
      <Route path="/outputs" component={Outputs} />
      <Route path="/orchestrator" component={Orchestrator} />
      <Route path="/system" component={System} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/data-cleaning" component={DataCleaning} />
      <Route path="/project-master" component={ProjectMaster} />
      <Route path="/project/:id" component={ProjectPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();

  // TEMP: Auth disabled for testing - redirect login to dashboard
  if (location === "/login") {
    return <Redirect to="/" />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between px-4 py-2 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            <ProtectedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <FilterProvider>
            <AppContent />
          </FilterProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
