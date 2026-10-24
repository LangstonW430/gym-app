import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, back, action, subtitle }: { title: string; back?: string; action?: ReactNode; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 pt-safe backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-2">
        {back ? (
          <Link href={back} className="grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label="Back">
            <ChevronLeft className="size-6" />
          </Link>
        ) : (
          <div className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex max-w-lg flex-col gap-4 p-4">{children}</main>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
