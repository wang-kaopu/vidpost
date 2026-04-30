<script setup lang="ts">
const props = defineProps<{
  name:
    | "phone"
    | "shield"
    | "search"
    | "plus"
    | "accounts"
    | "works"
    | "records"
    | "download"
    | "refresh"
    | "trash";
  size?: number;
}>();

const size = props.size ?? 20;
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <template v-if="name === 'phone'">
      <path d="M6.7 3.8C7 3 7.8 2.6 8.6 2.9L11 3.9C11.8 4.2 12.2 5.1 11.9 5.9L11.1 8C11 8.4 10.7 8.7 10.4 8.9L8.9 9.6C10 11.8 11.8 13.7 14 14.8L14.7 13.3C14.9 12.9 15.2 12.7 15.6 12.5L17.7 11.7C18.5 11.4 19.4 11.8 19.7 12.6L20.7 15C21 15.8 20.6 16.6 19.8 16.9L18.1 17.5C17.2 17.9 16.2 17.9 15.3 17.6C11 16 7.6 12.6 6 8.3C5.7 7.4 5.7 6.4 6.1 5.5L6.7 3.8Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'shield'">
      <path d="M12 3L18 5.2V10.7C18 14.2 15.6 17.3 12 18.3C8.4 17.3 6 14.2 6 10.7V5.2L12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M9.4 10.8L11.2 12.6L14.8 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'search'">
      <path d="M11 18C14.9 18 18 14.9 18 11C18 7.1 14.9 4 11 4C7.1 4 4 7.1 4 11C4 14.9 7.1 18 11 18Z" stroke="currentColor" stroke-width="1.8" />
      <path d="M20 20L16.65 16.65" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5V19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M5 12H19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'accounts'">
      <path d="M12 12C14.76 12 17 9.76 17 7C17 4.24 14.76 2 12 2C9.24 2 7 4.24 7 7C7 9.76 9.24 12 12 12Z" stroke="currentColor" stroke-width="1.8" />
      <path d="M4 21C4.9 17.97 7.79 16 11 16H13C16.21 16 19.1 17.97 20 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'works'">
      <path d="M3.5 8.5C3.5 7.4 4.4 6.5 5.5 6.5H18.5C19.6 6.5 20.5 7.4 20.5 8.5V17.5C20.5 18.6 19.6 19.5 18.5 19.5H5.5C4.4 19.5 3.5 18.6 3.5 17.5V8.5Z" stroke="currentColor" stroke-width="1.8" />
      <path d="M8 6.5V5.5C8 4.4 8.9 3.5 10 3.5H14C15.1 3.5 16 4.4 16 5.5V6.5" stroke="currentColor" stroke-width="1.8" />
    </template>
    <template v-else-if="name === 'records'">
      <path d="M12 6V12L16 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C14.4 3 16.59 3.94 18.21 5.47" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 4V14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M8 10L12 14L16 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M5 19H19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 7.03 7.03 3 12 3C15.5 3 18.5 5 20 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M21 3V8H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M3 6H21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M8 6V4C8 3.4 8.4 3 9 3H15C15.6 3 16 3.4 16 4V6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M19 6V20C19 20.6 18.6 21 18 21H6C5.4 21 5 20.6 5 20V6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M10 11V17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M14 11V17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </template>
  </svg>
</template>
