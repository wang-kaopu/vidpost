import type { ColumnDef } from "@tanstack/vue-table";
import type { PublishAccountItem } from "@/api/publish";

/** 账号管理表格的稳定列定义。 */
export const accountColumns: ColumnDef<PublishAccountItem>[] = [
  { accessorKey: "platform", header: "平台" },
  { accessorKey: "nickname", header: "账号昵称" },
  { accessorKey: "id", header: "账号ID" },
  { accessorKey: "remarkName", header: "备注名" },
  { accessorKey: "phoneNumber", header: "手机号" },
  { accessorKey: "tags", header: "标签" },
  { accessorKey: "status", header: "状态" },
  { id: "actions", header: "操作" },
];
