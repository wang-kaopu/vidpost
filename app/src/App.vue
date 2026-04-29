<script setup>
const VIDEO_PATH = '/Users/wkp/Downloads/olivia.mp4'
const COVER_PATH = '/Users/wkp/Downloads/olivia.jpg'
const PUBLISH_TITLE = 'Olivia IG update'
const PUBLISH_INTRODUCTION = 'Olivia IG update'
const ACCESS_TOKEN = 'b0ffc1de8f3f49340697dc140fcad274'

const PING_ACCOUNTS = Object.freeze({
  bilibili: {
    id: 11,
    user_id: '7447143878731407361',
    nickname: 'hello-bilibili',
    platform: 'bilibili',
    status: 'success',
    phone_number: 'sit velit',
    tags: ['tempor', 'tempor enim Lorem ex occaecat'],
    remark_name: 'dolor',
    created_at: '2026-04-29T09:13:50',
    updated_at: '2026-04-29T09:13:50',
    attributes: {
      esse_6: true,
    },
  },
  douyin: {
    id: 12,
    user_id: '7447143878731407360',
    nickname: 'hello',
    platform: 'douyin',
    status: 'success',
    phone_number: 'sit velit',
    tags: ['tempor', 'tempor enim Lorem ex occaecat'],
    remark_name: 'dolor',
    created_at: '2026-04-29T09:13:50',
    updated_at: '2026-04-29T09:13:50',
    attributes: {
      esse_6: true,
    },
  },
  sohu: {
    id: 13,
    user_id: '7447143878731407362',
    nickname: 'hello-sohu',
    platform: 'sohu',
    status: 'success',
    phone_number: 'sit velit',
    tags: ['tempor', 'tempor enim Lorem ex occaecat'],
    remark_name: 'dolor',
    created_at: '2026-04-29T09:13:50',
    updated_at: '2026-04-29T09:13:50',
    attributes: {
      esse_6: true,
    },
  },
  baijiahao: {
    id: 14,
    user_id: '7447143878731407363',
    nickname: 'hello-baijiahao',
    platform: 'baijiahao',
    status: 'success',
    phone_number: 'sit velit',
    tags: ['tempor', 'tempor enim Lorem ex occaecat'],
    remark_name: 'dolor',
    created_at: '2026-04-29T09:13:50',
    updated_at: '2026-04-29T09:13:50',
    attributes: {
      esse_6: true,
    },
  },
})

const createPublishPayload = (platform, accountId) => ({
  platform,
  accountId,
  videoPath: VIDEO_PATH,
  coverPath: COVER_PATH,
  title: PUBLISH_TITLE,
  introduction: PUBLISH_INTRODUCTION,
})

const login = (platform) => {
  window.electronAPI.login({
    platform,
    token: ACCESS_TOKEN,
  })
}

const ping = (account) => {
  window.electronAPI.ping(account)
}

const publishBilibili = () => {
  window.electronAPI.publish(createPublishPayload('bilibili', PING_ACCOUNTS.bilibili.id))
}

const publishDouyin = () => {
  window.electronAPI.publish(createPublishPayload('douyin', PING_ACCOUNTS.douyin.id))
}

const publishSohu = () => {
  window.electronAPI.publish(createPublishPayload('sohu', PING_ACCOUNTS.sohu.id))
}

const publishBaijiahao = () => {
  window.electronAPI.publish(createPublishPayload('baijiahao', PING_ACCOUNTS.baijiahao.id))
}
</script>

<template>
  <button @click="login('bilibili')">哔哩哔哩登录</button>
  <button @click="login('douyin')">抖音登录</button>
  <button @click="login('sohu')">搜狐号登录</button>
  <button @click="login('baijiahao')">百家号登录</button>

  <br>

  <button @click="ping(PING_ACCOUNTS.bilibili)">哔哩哔哩探活</button>
  <button @click="ping(PING_ACCOUNTS.douyin)">抖音探活</button>
  <button @click="ping(PING_ACCOUNTS.sohu)">搜狐号探活</button>
  <button @click="ping(PING_ACCOUNTS.baijiahao)">百家号探活</button>

  <br>

  <button @click="publishBilibili">哔哩哔哩发布</button>
  <button @click="publishDouyin">抖音发布</button>
  <button @click="publishSohu">搜狐号发布</button>
  <button @click="publishBaijiahao">百家号发布</button>

</template>
