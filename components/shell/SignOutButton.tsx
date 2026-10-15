"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { signOutAction } from "@/lib/auth-actions";

// Sits right next to the profile avatar, so a mis-tap used to sign the user
// out instantly with no way back — require an explicit confirm step.
export function SignOutButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="ออกจากระบบ"
        onClick={() => setOpen(true)}
      >
        <LogOut className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>ออกจากระบบ?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">คุณต้องการออกจากระบบใช่หรือไม่</p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              ยกเลิก
            </Button>
            <form action={signOutAction}>
              <Button type="submit" variant="destructive">
                ออกจากระบบ
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
