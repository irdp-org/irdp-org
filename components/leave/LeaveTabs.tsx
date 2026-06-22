"use client";

import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function LeaveTabs({
  defaultTab,
  mine,
  approvals,
}: {
  defaultTab: "mine" | "approvals";
  mine: ReactNode;
  approvals: ReactNode | null;
}) {
  if (!approvals) return <>{mine}</>;

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="mine">คำขอของฉัน</TabsTrigger>
        <TabsTrigger value="approvals">รออนุมัติ</TabsTrigger>
      </TabsList>
      <TabsContent value="mine">{mine}</TabsContent>
      <TabsContent value="approvals">{approvals}</TabsContent>
    </Tabs>
  );
}
