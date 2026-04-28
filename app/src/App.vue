<script setup>

const login = (platform) => {
  window.electronAPI.login(platform)
}

const ping = (accountUlid) => {
  window.electronAPI.ping(accountUlid)
}

const publish = (platform) => {
  window.electronAPI.publish(platform)
}
</script>

<template>
  <button @click="login('bilibili')">哔哩哔哩登录</button>
  <button @click="login('douyin')">抖音登录</button>
  <button @click="login('sohu')">搜狐号登录</button>
  <button @click="login('baijiahao')">百家号登录</button>

  <br>

  <button @click="ping('01KQ9XEKN0ZTQ0YR6JPTJE1FGN')">哔哩哔哩探活</button>
  <button @click="ping('01KQADE2B6HRM8VK2BMR4V85FQ')">抖音探活</button>
  <button @click="ping('01KQADGEHXQKST6GHY71GSQ1RZ')">搜狐号探活</button>
  <button @click="ping('01KQADJM3YHY93GNPK3169R9FX')">百家号探活</button>

  <br>

  <button @click="publish('bilibili')">哔哩哔哩发布</button>
  <button @click="publish('douyin')">抖音发布</button>
  <button @click="publish('sohu')">搜狐号发布</button>
  <button @click="publish('baijiahao')">百家号发布</button>

</template>
