"use client";

import { ChartLine, Dumbbell, History, House, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocalWorkout } from "@/lib/active-workout";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Home", icon: House },
  { href: "/workout", label: "Workout", icon: Dumbbell },
  { href: "/history", label: "History", icon: History },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomNav() {
  const path = usePathname();
  const active = useLocalWorkout();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-safe backdrop-blur">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground",
                  on && "text-primary",
                )}
              >
                <Icon className="size-6" />
                {t.label}
                {t.href === "/workout" && active && (
                  <span className="absolute top-2 right-[calc(50%-18px)] size-2.5 rounded-full bg-success" aria-label="Workout in progress" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
