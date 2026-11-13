"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

// Shared shell for every signed-in page; owns the mobile menu's open state.
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    // Stop the page behind the drawer from scrolling.
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="flex min-h-screen gap-2 p-2">
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="sticky top-0 z-20 -mt-2 bg-background pt-2">
          <Topbar onMenu={() => setMenuOpen(true)} />
        </div>
        <main className="min-w-0 flex-1 space-y-4 px-1 py-4 sm:px-5">
          {children}
        </main>
      </div>
    </div>
  );
}
