import Link from "next/link";
import { FileQuestion } from "lucide-react";

export function NotFoundCard() {
  return (
    <div className="flex flex-col items-center gap-5 text-center max-w-sm">
      <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
        <FileQuestion className="size-7 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-lg font-semibold tracking-tight">404 — Page not found</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs transition-opacity hover:opacity-90"
      >
        Back to home
      </Link>
    </div>
  );
}
