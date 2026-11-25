import { useCallback, useMemo, useState } from 'react'
import { DashboardControlHeader } from '../components/dashboard/DashboardControlHeader.tsx'
import { DashboardUnifiedList } from '../components/dashboard/DashboardUnifiedList.tsx'
import { DashboardVerifyModal } from '../components/dashboard/DashboardVerifyModal.tsx'
import { useDashboardMetrics } from '../hooks/useDashboardMetrics.ts'
import { useServerBootstrap } from '../hooks/useServerBootstrap.ts'
import type { DashboardUnifiedItem } from '../types/dashboardUnified.ts'
import { buildDashboardUnifiedSections } from '../utils/buildDashboardUnifiedItems.ts'
import { useOmpsContractAccessStatus } from '../hooks/useOmpsContractAccessStatus.ts'
import { shouldShowOmpsDashboardLanAccess } from '../utils/packagedBundledOmps.ts'

export type DashboardPageProps = {
  onOpenSystems: () => void
  showSystemsNav?: boolean
  onOpenServer: (systemId?: string) => void
  onOpenBundledOmpsSetup?: () => void
}

function isBootstrapPrepared(
  status: ReturnType<typeof useServerBootstrap>['status'],
  job: ReturnType<typeof useServerBootstrap>['job'],
  installBusy: boolean,
): boolean {
  const jobActive = job != null && (job.phase === 'running' || job.phase === 'queued')
  if (installBusy || jobActive) return false
  return job?.phase === 'success' || status?.readyForManifestInstall === true
}

export function DashboardPage({ onOpenSystems, showSystemsNav = true, onOpenServer }: DashboardPageProps) {
  const showOmpsContractAccess = shouldShowOmpsDashboardLanAccess()
  const {
    cpu,
    memory,
    installedInventory,
    databaseSummary,
    onlineUsers,
    operational,
    installedSystems,
    metricsReady,
    lastUpdatedAt,
    isRefreshing,
    refresh,
  } = useDashboardMetrics()
  const contractAccess = useOmpsContractAccessStatus(showOmpsContractAccess, lastUpdatedAt)
  const bootstrap = useServerBootstrap()
  const [modalItem, setModalItem] = useState<DashboardUnifiedItem | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  const bootstrapPrepared = isBootstrapPrepared(bootstrap.status, bootstrap.job, bootstrap.installBusy)

  const { gridItems, systemItems } = useMemo(() => {
    const sections = buildDashboardUnifiedSections({
      metricsReady,
      operational,
      installedInventory,
      cpu,
      memory,
      onlineUsers,
      installedSystems,
      bootstrapStatus: bootstrap.status,
      bootstrapLoading: bootstrap.loading,
      bootstrapError: bootstrap.error,
      bootstrapPrepared,
      bootstrapJobPhase: bootstrap.job?.phase,
    })
    const gridItems = sections.gridItems.filter((item) => item.id !== 'operational-global')
    return { gridItems, systemItems: sections.systemItems }
  }, [
    metricsReady,
    operational,
    installedInventory,
    cpu,
    memory,
    onlineUsers,
    installedSystems,
    bootstrap.status,
    bootstrap.loading,
    bootstrap.error,
    bootstrapPrepared,
    bootstrap.job?.phase,
  ])

  const runVerifyForItem = useCallback(
    async (item: DashboardUnifiedItem) => {
      setVerifyingId(item.id)
      try {
        if (item.id === 'bootstrap-deps' || item.id === 'bootstrap-prepare') {
          await bootstrap.refresh()
        } else {
          await refresh()
        }
      } finally {
        setVerifyingId(null)
      }
    },
    [bootstrap, refresh],
  )

  const handleVerify = useCallback(
    (item: DashboardUnifiedItem) => {
      setModalItem(item)
      void runVerifyForItem(item)
    },
    [runVerifyForItem],
  )

  function openPrepareModal() {
    const prepare = gridItems.find((i) => i.id === 'bootstrap-prepare')
    if (prepare) handleVerify(prepare)
  }

  return (
    <section className="page page-dashboard page-dashboard-host page-dashboard-unified">
      <div className="dashboard-host-body">
        <DashboardControlHeader
          operational={operational}
          lastUpdatedAt={lastUpdatedAt}
          isRefreshing={isRefreshing}
          onRefresh={() => {
            void refresh()
            if (showOmpsContractAccess) {
              void contractAccess.refresh()
            }
          }}
          onOpenSystems={onOpenSystems}
          showSystemsNav={showSystemsNav}
          onOpenServer={() => onOpenServer()}
          onOpenPrepare={openPrepareModal}
          lanAccess={showOmpsContractAccess ? contractAccess.state : undefined}
          onLanAccessAnalyze={showOmpsContractAccess ? contractAccess.analyze : undefined}
          onLanAccessPause={showOmpsContractAccess ? contractAccess.pauseInstall : undefined}
          onLanAccessRestart={showOmpsContractAccess ? contractAccess.restartInstall : undefined}
          lanAccessControlBusy={showOmpsContractAccess ? contractAccess.controlBusy : null}
        />

        <DashboardUnifiedList
          gridItems={gridItems}
          systemItems={systemItems}
          verifyingId={verifyingId}
          onVerify={handleVerify}
        />
      </div>

      {modalItem ? (
        <DashboardVerifyModal
          item={modalItem}
          verifying={verifyingId === modalItem.id}
          metricsReady={metricsReady}
          lastUpdatedAt={lastUpdatedAt}
          operational={operational}
          installedInventory={installedInventory}
          databaseSummary={databaseSummary}
          cpu={cpu}
          memory={memory}
          onlineUsers={onlineUsers}
          installedSystems={installedSystems}
          bootstrapStatus={bootstrap.status}
          bootstrapError={bootstrap.error}
          bootstrapJob={bootstrap.job}
          bootstrapLogTail={bootstrap.logTail}
          bootstrapInstallBusy={bootstrap.installBusy}
          bootstrapPrepared={bootstrapPrepared}
          onClose={() => setModalItem(null)}
          onRepeatVerify={() => void runVerifyForItem(modalItem)}
          onOpenSystems={onOpenSystems}
          onOpenServer={onOpenServer}
          onBootstrapRefresh={() => void bootstrap.refresh()}
          onBootstrapPrepare={() => void bootstrap.runInstall({ launchDockerDesktop: true })}
        />
      ) : null}
    </section>
  )
}
