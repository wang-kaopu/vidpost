/** 创建账号页面模型时允许提供的远端账号字段。 */
export interface AccountPageModelInput {
  id: string | number;
  nickname?: string | null;
  platform?: string | null;
  status?: string;
  phoneNumber?: string | null;
  tags?: unknown[] | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** 将账号服务数据转换成渲染进程使用的字段格式。 */
export function createAccountPageModel({
  id,
  nickname = null,
  platform = null,
  status = "login_success",
  phoneNumber = null,
  tags = [],
  createdAt = null,
  updatedAt = null,
}: AccountPageModelInput) {
  return {
    id,
    nickname,
    platform,
    status,
    phone_number: phoneNumber,
    tags: Array.isArray(tags) ? tags : [],
    created_at: createdAt,
    updated_at: updatedAt,
  };
}
