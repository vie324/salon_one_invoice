import { Gift } from "lucide-react";

/** 紹介フォームの外枠(常設・トークン付きで共通) */
export function ReferShell({
  children,
  orgName,
}: {
  children: React.ReactNode;
  orgName?: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-100 py-5 dark:bg-background sm:py-8">
      <div className="mx-auto max-w-2xl px-4">
        <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Gift className="h-4 w-4" />
          ご紹介フォーム{orgName ? ` — ${orgName}` : ""}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ReferNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center shadow-sm sm:p-8">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
