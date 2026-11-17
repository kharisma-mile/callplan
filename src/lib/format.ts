export const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

export function rupiahShort(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} M`;
  if (abs >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  return rupiah(n);
}

export const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function fmtDate(iso: string) {
  const [d, t] = iso.split(" ");
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}${t ? " " + t : ""}`;
}
export function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  const full = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${full[Number(m) - 1]} ${y}`;
}

export function nowStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `2026-11-17 ${hh}:${mm}`;
}

export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
