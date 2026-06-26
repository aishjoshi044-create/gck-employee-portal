import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // Calmer, slower pulse for a professional feel (Linear/Notion-like).
  return (
    <div
      className={cn("rounded-md bg-primary/10 gck-skeleton", className)}
      {...props}
    />
  );
}

export { Skeleton };
