function createAccountPageModel({
  id,
  nickname = null,
  platform = null,
  status = 'login_success',
  phoneNumber = null,
  tags = [],
  createdAt = null,
  updatedAt = null,
}) {
  return {
    id,
    nickname,
    platform,
    status,
    phone_number: phoneNumber,
    tags: Array.isArray(tags) ? tags : [],
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

module.exports = {
  createAccountPageModel,
}
