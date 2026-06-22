import type { RoleT } from "@/lib/database.types";

// Mirrors the SQL helpers in supabase/migrations/0001_init.sql section 3.
// RLS in Postgres is the real enforcement — these are for UI gating only
// (hide/disable, never the only access check). See CLAUDE.md §4.

export const isAdmin = (role: RoleT | null | undefined) => role === "admin";
export const isDeptHead = (role: RoleT | null | undefined) => role === "dept_head";
export const isHr = (role: RoleT | null | undefined) => role === "hr";
export const isExec = (role: RoleT | null | undefined) => role === "exec";

// hr/admin/exec see every department.
export const isOversight = (role: RoleT | null | undefined) =>
  role === "hr" || role === "admin" || role === "exec";

// hr/admin can edit times/requests directly (hr cannot approve).
export const canEdit = (role: RoleT | null | undefined) => role === "hr" || role === "admin";

export const isHeadOf = (
  role: RoleT | null | undefined,
  employeeDeptId: string | null | undefined,
  targetDeptId: string | null | undefined
) => isDeptHead(role) && !!employeeDeptId && employeeDeptId === targetDeptId;

export const roleLabelTh: Record<RoleT, string> = {
  employee: "พนักงาน",
  dept_head: "หัวหน้าฝ่าย",
  hr: "ฝ่ายบุคคล",
  admin: "ผู้ดูแลระบบ",
  exec: "ผู้บริหาร",
};
