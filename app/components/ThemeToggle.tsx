"use client";

import { Moon } from "lucide-react";
import { useEffect } from "react";

type ThemeToggleProps = {
  className?: string;
};

const STORAGE_KEY = "theme";

function applyDarkTheme() {
  const root = document.documentElement;
  root.classList.add("dark");
  window.localStorage.setItem(STORAGE_KEY, "dark");
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  useEffect(() => {
    applyDarkTheme();
  }, []);

  return (
    <div
      role="status"
      aria-label="Dark mode is active"
      className={
        className ??
        "fixed right-4 top-4 z-70 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/85 px-3 py-2 text-xs font-semibold text-foreground shadow-md backdrop-blur-md transition hover:border-primary/60 hover:text-primary sm:right-6 sm:top-6"
      }
    >
      <Moon className="h-4 w-4" aria-hidden="true" />
      <span>Dark Mode</span>
    </div>
  );
}
