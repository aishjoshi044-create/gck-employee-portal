import { createFileRoute } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, X, FileDown, FileSpreadsheet } from "lucide-react";
import { downloadPdf, downloadExcel } from "@/lib/exports";

export const Route = createFileRoute("/_authenticated/admin/attendance")({
  component: AdminAttendance,
});

function AdminAttendance() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: rows } = useQuery({
    queryKey: ["admin-attendance", date],
    queryFn: async () => {
      const [{ data: profs }, { data: att }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,department,username").eq("active", true),
        supabase.from("attendance").select("*").eq("date", date),
      ]);
      return (profs ?? []).map((p) => ({ ...p, attendance: att?.find((a) => a.user_id === p.id) ?? null }));
    },
  });

  const mark = async (user_id: string, status: "present" | "absent" | "leave") => {
    const { error } = await supabase.from("attendance").upsert({ user_id, date, status }, { onConflict: "user_id,date" });
    if (error) toast.error(error.message); else { qc.invalidateQueries({ queryKey: ["admin-attendance"] }); toast.success("Saved"); }
  };

  const buildRows = () =>
    (rows ?? []).map((r: any) => [
      r.full_name,
      r.department ?? "—",
      r.attendance?.status ?? "—",
      r.attendance?.check_in_at ? format(new Date(r.attendance.check_in_at), "h:mm a") : "—",
      r.attendance?.lat && r.attendance?.lng ? `${r.attendance.lat.toFixed(4)}, ${r.attendance.lng.toFixed(4)}` : "—",
    ]);
  const HEAD = ["Name", "Department", "Status", "Check-in", "Location"];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("attendance")}</h1>
      <div className="flex items-center gap-2 flex-wrap">
        <Input type="date" className="tap-lg max-w-xs" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button variant="outline" className="gap-2" onClick={() => downloadPdf({ title: `Attendance — ${format(new Date(date), "d MMM yyyy")}`, filename: `attendance-${date}.pdf`, head: HEAD, body: buildRows() })}>
          <FileDown className="size-4" /> PDF
        </Button>
        <Button variant="outline" className="gap-2" onClick={() => downloadExcel(`attendance-${date}.xlsx`, [{ name: date, header: HEAD, rows: buildRows() }])}>
          <FileSpreadsheet className="size-4" /> Excel
        </Button>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs">
            <tr><th className="text-left p-2">Name</th><th className="text-left p-2 hidden sm:table-cell">Dept</th><th className="text-left p-2">Status</th><th className="p-2">Mark</th></tr>
          </thead>
          <tbody>
            {rows?.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-semibold">{r.full_name}</td>
                <td className="p-2 hidden sm:table-cell text-muted-foreground">{r.department ?? "—"}</td>
                <td className="p-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    r.attendance?.status === "present" ? "bg-success/20 text-success" :
                    r.attendance?.status === "leave" ? "bg-info/20 text-info" :
                    r.attendance?.status === "absent" ? "bg-destructive/20 text-destructive" : "bg-muted"
                  }`}>{r.attendance?.status ? t(r.attendance.status as any) : "—"}</span>
                </td>
                <td className="p-2 flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => mark(r.id, "present")} title={t("present")}><Check className="size-4 text-success" /></Button>
                  <Button size="sm" variant="outline" onClick={() => mark(r.id, "absent")} title={t("absent")}><X className="size-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
