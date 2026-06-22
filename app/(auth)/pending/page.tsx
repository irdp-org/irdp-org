import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/lib/auth-actions";

export default async function PendingPage() {
  const employee = await getCurrentEmployee();
  if (employee) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">บัญชีรอการอนุมัติจาก HR</CardTitle>
          <CardDescription>
            ยังไม่พบข้อมูลพนักงานของคุณในระบบ กรุณาติดต่อฝ่ายบุคคล (HR)
            เพื่อลงทะเบียนบัญชีก่อนใช้งาน
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" className="h-11 w-full">
              ออกจากระบบ / สลับบัญชี
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
