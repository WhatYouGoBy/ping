<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'
import { useSyncStore } from '@/stores/sync'

const router = useRouter()
const sync = useSyncStore()

const enabled = ref(sync.enabled)
const url = ref(sync.url)
const code = ref(sync.code)
const saved = ref(false)

onMounted(() => {
  enabled.value = sync.enabled
  url.value = sync.url
  code.value = sync.code
})

const dirty = computed(
  () => enabled.value !== sync.enabled || url.value.trim() !== sync.url || code.value.trim() !== sync.code,
)

const statusSeverity = computed(() => {
  switch (sync.status) {
    case 'synced':
      return 'success'
    case 'error':
      return 'error'
    case 'offline':
      return 'warn'
    default:
      return 'secondary'
  }
})

function save() {
  sync.configure({ enabled: enabled.value, url: url.value.trim(), code: code.value.trim() })
  saved.value = true
  setTimeout(() => (saved.value = false), 1500)
}

function syncNow() {
  void sync.runNow()
}

function fmt(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString() : 'never'
}
</script>

<template>
  <div class="flex flex-col gap-6 max-w-2xl">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl md:text-3xl font-semibold">Sync</h1>
      <Button
        label="Back"
        icon="pi pi-arrow-left"
        severity="secondary"
        text
        size="small"
        @click="router.push({ name: 'home' })"
      />
    </div>

    <p class="text-sm opacity-80">
      Ping works fully offline. Turn on sync to keep your players, tournaments and match history
      backed up on a shared server and available on every device that uses the same group code.
      Everyone who enters the same code shares the same data.
    </p>

    <section class="flex flex-col gap-4 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="font-medium">Enable sync</div>
          <div class="text-xs opacity-70">Offline changes are queued and pushed automatically.</div>
        </div>
        <ToggleSwitch v-model="enabled" />
      </div>

      <div class="flex flex-col gap-2">
        <label for="sync-url" class="text-sm font-medium">Server URL</label>
        <InputText id="sync-url" v-model="url" placeholder="https://ping.whatyougoby.com" />
        <div class="text-xs opacity-70">
          Base URL of the sync server. Prefilled with this app's own address.
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <label for="sync-code" class="text-sm font-medium">Group code</label>
        <InputText id="sync-code" v-model="code" placeholder="e.g. monday-club-7f3a" />
        <div class="text-xs opacity-70">
          Any shared secret. Use the same code on every device in your group. Anyone with the code
          can read and edit the data, so treat it like a password.
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <Button label="Save" icon="pi pi-check" :disabled="!dirty" @click="save" />
        <Button
          label="Sync now"
          icon="pi pi-sync"
          severity="secondary"
          :disabled="!sync.configured || sync.status === 'syncing'"
          :loading="sync.status === 'syncing'"
          @click="syncNow"
        />
        <span v-if="saved" class="text-sm text-positive">Saved</span>
      </div>
    </section>

    <section class="flex flex-col gap-3 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
      <h2 class="text-lg font-semibold">Status</h2>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="opacity-70">State</div>
        <div><Message :severity="statusSeverity" :closable="false">{{ sync.statusLabel }}</Message></div>
        <div class="opacity-70">Last synced</div>
        <div>{{ fmt(sync.lastSyncedAt) }}</div>
        <div class="opacity-70">Pending changes</div>
        <div>{{ sync.pending ? 'yes' : 'no' }}</div>
        <div class="opacity-70">Server revision</div>
        <div class="tabular-nums">{{ sync.cursor }}</div>
        <div v-if="sync.lastError" class="opacity-70">Last error</div>
        <div v-if="sync.lastError" class="text-negative break-all">{{ sync.lastError }}</div>
      </div>
    </section>
  </div>
</template>
