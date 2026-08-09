<template>
  <ProfileManagerContent :embedded="embedded" />
</template>

<script setup>
import ProfileManagerContent from '@/pages/profile-manager/components/ProfileManagerContent.vue'

defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})
</script>
