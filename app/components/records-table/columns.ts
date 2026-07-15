import type { ColumnDef } from "@tanstack/vue-table";
import type { PublishTask } from "@/api/publish";

/** 发布记录表格的稳定列定义。 */
export const recordColumns: ColumnDef<PublishTask>[] = [
  { id: "select" },
  { accessorKey: "platform", header: "平台" },
  { accessorKey: "account_id", header: "账号ID" },
  { accessorKey: "title", header: "内容标题" },
  { accessorKey: "status", header: "状态" },
  { accessorKey: "scheduled_at", header: "预约发布时间" },
  { id: "actions", header: "操作" },
];
