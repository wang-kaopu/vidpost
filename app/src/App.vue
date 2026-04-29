<script setup>
const VIDEO_PATH = '/Users/wkp/Downloads/olivia.mp4'
const COVER_PATH = '/Users/wkp/Downloads/olivia.jpg'
const PUBLISH_TITLE = 'Olivia IG update'
const PUBLISH_INTRODUCTION = 'Olivia IG update'

const createPublishPayload = (platform, accountId) => ({
  platform,
  accountId,
  videoPath: VIDEO_PATH,
  coverPath: COVER_PATH,
  title: PUBLISH_TITLE,
  introduction: PUBLISH_INTRODUCTION,
})

const login = (platform) => {
  window.electronAPI.login(platform)
}

const ping = (platform, accountId) => {
  window.electronAPI.ping({ platform, accountId })
}

const publishBilibili = () => {
  window.electronAPI.publish(createPublishPayload('bilibili', '01KQ9XEKN0ZTQ0YR6JPTJE1FGN'))
}

const publishDouyin = () => {
  window.electronAPI.publish(createPublishPayload('douyin', '01KQADE2B6HRM8VK2BMR4V85FQ'))
}

const publishSohu = () => {
  window.electronAPI.publish(createPublishPayload('sohu', '01KQADGEHXQKST6GHY71GSQ1RZ'))
}

const publishBaijiahao = () => {
  window.electronAPI.publish(createPublishPayload('baijiahao', '01KQADJM3YHY93GNPK3169R9FX'))
}
</script>

<template>
  <button @click="login('bilibili')">哔哩哔哩登录</button>
  <button @click="login('douyin')">抖音登录</button>
  <button @click="login('sohu')">搜狐号登录</button>
  <button @click="login('baijiahao')">百家号登录</button>

  <br>

  <button @click="ping('bilibili', '20')">哔哩哔哩探活</button>
  <button @click="ping('douyin', '21')">抖音探活</button>
  <button @click="ping('sohu', '22')">搜狐号探活</button>
  <button @click="ping('baijiahao', '23')">百家号探活</button>

  <br>

  <button @click="publishBilibili">哔哩哔哩发布</button>
  <button @click="publishDouyin">抖音发布</button>
  <button @click="publishSohu">搜狐号发布</button>
  <button @click="publishBaijiahao">百家号发布</button>

</template>
