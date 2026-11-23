import { Bell, Menu, Search, Sparkles } from "lucide-react";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="flex items-center justify-between gap-3 rounded-xl bg-ink px-3 py-2.5 sm:gap-4">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenu}
        className="grid size-9 shrink-0 place-items-center rounded-lg text-white/80 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
      >
        <Menu className="size-5" strokeWidth={1.75} />
      </button>

      <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-brand px-3 py-2 text-white/60 sm:max-w-sm">
        <Search className="size-4 shrink-0" />
        <input
          type="search"
          placeholder="Search global intelligence..."
          className="w-full min-w-0 bg-transparent text-[0.9375rem] text-white outline-none placeholder:text-white/50"
        />
      </label>

      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <button
          type="button"
          aria-label="Notifications, 2 unread"
          className="relative text-white/80 transition-colors hover:text-white"
        >
          <Bell className="size-5" strokeWidth={1.75} />
          <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-red-500 text-[0.75rem] font-bold text-white">
            2
          </span>
        </button>
        <button
          type="button"
          aria-label="Ask Entopedia"
          className="flex items-center gap-2 rounded-lg bg-brand px-2.5 py-2 text-[0.9375rem] font-medium text-white transition-colors hover:bg-brand/80 sm:px-3"
        >
          <Sparkles className="size-4" strokeWidth={1.75} />
          <span className="hidden sm:inline">Ask Entopedia</span>
        </button>
      </div>
    </header>
  );
}
