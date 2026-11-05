<script setup>
import { inject, ref } from 'vue'
import CatalogEditor from './CatalogEditor.vue'
const {state,saving,connected,currentRoom,saveCatalog,reloadSource}=inject('workspace')
const editor=ref(null)
defineExpose({reset:()=>editor.value?.reset()})
</script>
<template><CatalogEditor ref="editor" :restaurants="state.restaurants" :version="state.catalogVersion" :saving="saving" :connected="connected" :source-status="state.sourceStatus" :room="currentRoom" @save="saveCatalog" @reload-source="reloadSource" /></template>
