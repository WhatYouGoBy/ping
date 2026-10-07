<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Menubar from 'primevue/menubar'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useTournamentsStore } from '@/stores/tournaments'
import { useSyncStore } from '@/stores/sync'
import { exportFilename } from '@/lib/transfer'
import { downloadJSON } from '@/utils/download'
import { parseChangelog, releasesBetween, type Release } from '@/lib/changelog'
import ChangelogDialog from '@/components/ChangelogDialog.vue'
import changelogRaw from '../CHANGELOG.md?raw'

const router = useRouter()
const dark = ref(true)
const version = __APP_VERSION__
const store = useTournamentsStore()
const sync = useSyncStore()
const toast = useToast()
const confirm = useConfirm()
const fileInput = ref<HTMLInputElement | null>(null)

const items = computed(() => [
  {
    label: 'Tournaments',
    icon: 'pi pi-table',
    command: () => router.push({ name: 'home' }),
  },
  {
    label: 'Players',
    icon: 'pi pi-users',
    command: () => router.push({ name: 'players' }),
  },
  {
    label: 'History',
    icon: 'pi pi-history',
    command: () => router.push({ name: 'history' }),
  },
  {
    label: 'Sync',
    icon: 'pi pi-cloud',
    command: () => router.push({ name: 'settings' }),
  },
])

const syncIndicator = computed(() => {
  switch (sync.status) {
    case 'synced':
      return { icon: 'pi pi-cloud-upload', severity: 'success' as const, tip: 'Synced' }
    case 'syncing':
      return { icon: 'pi pi-spin pi-spinner', severity: 'info' as const, tip: 'Syncing…' }
    case 'error':
      return { icon: 'pi pi-exclamation-triangle', severity: 'danger' as const, tip: `Sync error: ${sync.lastError ?? ''}` }
    case 'offline':
      return { icon: 'pi pi-cloud', severity: 'warn' as const, tip: 'Offline — changes queued' }
    case 'idle':
      return { icon: 'pi pi-cloud', severity: 'secondary' as const, tip: 'Sync ready' }
    default:
      return { icon: 'pi pi-cloud', severity: 'secondary' as const, tip: 'Sync off' }
  }
})

const footerNote = computed(() =>
  sync.configured ? sync.statusLabel : 'data stays on this device',
)

function toggleDark() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('app-theme-dark', dark.value)
  localStorage.setItem('ping.theme', dark.value ? 'dark' : 'light')
}

function exportData() {
  downloadJSON(store.exportJSON(), exportFilename())
  toast.add({
    severity: 'success',
    summary: 'Exported',
    detail: `${store.tournaments.length} tournament(s), ${Object.keys(store.players).length} player(s)`,
    life: 3000,
  })
}

function pickImport() {
  fileInput.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let raw: string
  try {
    raw = await file.text()
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Import failed', detail: String(err), life: 5000 })
    return
  }
  confirm.require({
    message:
      'Importing will replace every player, tournament, and match currently on this device. Continue?',
    header: 'Replace all local data?',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Replace',
    acceptClass: 'p-button-danger',
    accept: () => {
      try {
        store.importJSON(raw)
        toast.add({
          severity: 'success',
          summary: 'Imported',
          detail: `${store.tournaments.length} tournament(s), ${Object.keys(store.players).length} player(s)`,
          life: 3000,
        })
        router.push({ name: 'home' })
      } catch (err) {
        toast.add({
          severity: 'error',
          summary: 'Import failed',
          detail: err instanceof Error ? err.message : String(err),
          life: 6000,
        })
      }
    },
  })
}

// "What's new" after an update: compare the running version against the last
// one this device has seen and show the changelog entries in between.
const LAST_SEEN_VERSION_KEY = 'ping.lastSeenVersion'
const changelogVisible = ref(false)
const newReleases = ref<Release[]>([])

function checkForUpdate() {
  const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY)
  localStorage.setItem(LAST_SEEN_VERSION_KEY, version)
  // First visit: nothing is "new" yet — record the version silently.
  if (!lastSeen || lastSeen === version) return
  const releases = releasesBetween(parseChangelog(changelogRaw), lastSeen, version)
  if (releases.length > 0) {
    newReleases.value = releases
    changelogVisible.value = true
  }
}

// Install prompt
const installEvent = ref<Event | null>(null)
const canInstall = computed(() => !!installEvent.value)

async function install() {
  const ev = installEvent.value as unknown as { prompt?: () => Promise<void> } | null
  if (!ev?.prompt) return
  await ev.prompt()
  installEvent.value = null
}

onMounted(() => {
  const saved = localStorage.getItem('ping.theme')
  // Default to dark; respect explicit preference if the user has toggled before.
  dark.value = saved === 'light' ? false : true
  document.documentElement.classList.toggle('app-theme-dark', dark.value)
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    installEvent.value = e
  })
  checkForUpdate()
})
</script>

<template>
  <Menubar :model="items" class="app-menubar">
    <template #start>
      <button
        class="flex items-center gap-2 mr-4 cursor-pointer bg-transparent border-0 text-white font-semibold text-lg"
        @click="router.push({ name: 'home' })"
      >
        <i class="pi pi-circle-fill text-white/80" />
        <span>Ping</span>
      </button>
    </template>
    <template #end>
      <div class="flex items-center gap-2">
        <Button
          :icon="syncIndicator.icon"
          :severity="syncIndicator.severity"
          size="small"
          text
          rounded
          :aria-label="syncIndicator.tip"
          v-tooltip.bottom="syncIndicator.tip"
          @click="router.push({ name: 'settings' })"
        />
        <Button
          v-if="canInstall"
          icon="pi pi-download"
          label="Install"
          severity="secondary"
          size="small"
          @click="install"
        />
        <Button
          icon="pi pi-cloud-download"
          severity="secondary"
          size="small"
          text
          rounded
          aria-label="Export data"
          v-tooltip.bottom="'Export data'"
          @click="exportData"
        />
        <Button
          icon="pi pi-cloud-upload"
          severity="secondary"
          size="small"
          text
          rounded
          aria-label="Import data"
          v-tooltip.bottom="'Import data'"
          @click="pickImport"
        />
        <Button
          :icon="dark ? 'pi pi-sun' : 'pi pi-moon'"
          severity="secondary"
          size="small"
          text
          rounded
          @click="toggleDark"
        />
      </div>
    </template>
  </Menubar>

  <input
    ref="fileInput"
    type="file"
    accept="application/json,.json"
    class="hidden"
    @change="onFile"
  />

  <main class="flex-1 px-3 py-6 md:px-6 max-w-5xl w-full mx-auto">
    <RouterView />
  </main>

  <footer class="text-center text-xs opacity-60 py-3">
    Ping · v{{ version }} · {{ footerNote }}
  </footer>

  <Toast position="bottom-center" />
  <ConfirmDialog />
  <ChangelogDialog v-model:visible="changelogVisible" :releases="newReleases" />
</template>
