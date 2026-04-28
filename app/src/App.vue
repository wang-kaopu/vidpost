<script setup>

const login = (platform) => {
  window.electronAPI.login(platform)
}

const publish = () => {
  window.electronAPI.publish("触发publish事件")
}
</script>

<template>
  <button @click="login('bilibili')">哔哩哔哩登录</button>
  <button @click="login('douyin')">抖音登录</button>
  <button @click="login('sohu')">搜狐号登录</button>
  <button @click="login('baijiahao')">百家号登录</button>

  <button @click="publish">搜狐发布</button>
</template>
