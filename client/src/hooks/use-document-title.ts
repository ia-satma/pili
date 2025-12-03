import { useEffect } from "react";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} | PMO Dashboard` : "PMO Dashboard";
    
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
