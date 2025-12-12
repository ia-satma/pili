import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";

export interface FilterState {
  q: string;
  estado: string;
  depto: string;
  analista: string;
}

interface FilterContextValue {
  filters: FilterState;
  setFilter: (key: keyof FilterState, value: string) => void;
  setFilters: (filters: Partial<FilterState>) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  buildQueryString: () => string;
}

const defaultFilters: FilterState = {
  q: "",
  estado: "all",
  depto: "all",
  analista: "all",
};

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  
  const [filters, setFiltersState] = useState<FilterState>(() => {
    const params = new URLSearchParams(searchString);
    return {
      q: params.get("q") || "",
      estado: params.get("estado") || "all",
      depto: params.get("depto") || "all",
      analista: params.get("analista") || "all",
    };
  });

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const urlFilters: FilterState = {
      q: params.get("q") || "",
      estado: params.get("estado") || "all",
      depto: params.get("depto") || "all",
      analista: params.get("analista") || "all",
    };
    
    if (
      urlFilters.q !== filters.q ||
      urlFilters.estado !== filters.estado ||
      urlFilters.depto !== filters.depto ||
      urlFilters.analista !== filters.analista
    ) {
      setFiltersState(urlFilters);
    }
  }, [searchString]);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.estado && filters.estado !== "all") params.set("estado", filters.estado);
    if (filters.depto && filters.depto !== "all") params.set("depto", filters.depto);
    if (filters.analista && filters.analista !== "all") params.set("analista", filters.analista);
    return params.toString();
  }, [filters]);

  const updateUrl = useCallback((newFilters: FilterState) => {
    const params = new URLSearchParams();
    if (newFilters.q) params.set("q", newFilters.q);
    if (newFilters.estado && newFilters.estado !== "all") params.set("estado", newFilters.estado);
    if (newFilters.depto && newFilters.depto !== "all") params.set("depto", newFilters.depto);
    if (newFilters.analista && newFilters.analista !== "all") params.set("analista", newFilters.analista);
    
    const queryString = params.toString();
    const basePath = location.split("?")[0];
    const newUrl = queryString ? `${basePath}?${queryString}` : basePath;
    
    if (location !== newUrl) {
      setLocation(newUrl, { replace: true });
    }
  }, [location, setLocation]);

  const setFilter = useCallback((key: keyof FilterState, value: string) => {
    setFiltersState(prev => {
      const newFilters = { ...prev, [key]: value };
      updateUrl(newFilters);
      return newFilters;
    });
  }, [updateUrl]);

  const setFilters = useCallback((newFilters: Partial<FilterState>) => {
    setFiltersState(prev => {
      const merged = { ...prev, ...newFilters };
      updateUrl(merged);
      return merged;
    });
  }, [updateUrl]);

  const clearFilters = useCallback(() => {
    setFiltersState(defaultFilters);
    updateUrl(defaultFilters);
  }, [updateUrl]);

  const hasActiveFilters = 
    filters.q !== "" || 
    filters.estado !== "all" || 
    filters.depto !== "all" || 
    filters.analista !== "all";

  return (
    <FilterContext.Provider value={{ 
      filters, 
      setFilter, 
      setFilters, 
      clearFilters, 
      hasActiveFilters,
      buildQueryString 
    }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return context;
}
