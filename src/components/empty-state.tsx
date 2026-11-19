import { Inbox, Lock } from "lucide-react";

export function EmptyState({ title = "Tidak ada data", desc }: { title?: string; desc?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Inbox className="h-[55px] w-[55px] text-[#CFCFCF]" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {desc && <p className="max-w-md text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}

export function NoAccess({ perm }: { perm: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <Lock className="h-[55px] w-[55px] text-[#CFCFCF]" />
      <p className="text-base font-semibold text-foreground">Tidak punya akses</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Role Anda tidak memiliki permission <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{perm}</code>. Atur di menu Setting → Permission.
      </p>
    </div>
  );
}
