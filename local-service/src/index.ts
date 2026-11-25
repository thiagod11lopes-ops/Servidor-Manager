import { reconcileBundledOmpsFirstRunOnStartup } from './bundledOmps/bundledOmpsFirstRunReconciliation.ts'
import { ensureServidorOmpsProvisionOnStartup } from './bundledOmps/ensureServidorOmpsProvisionOnStartup.ts'
import { ensureServidorOmpsEmbeddedRuntime } from './servidorOmps/ensureServidorOmpsEmbeddedRuntime.ts'
import { registerLocalServiceProcessGuards } from './installation/registerLocalServiceProcessGuards.ts'
import { reconcileInstallationProgressOnStartup } from './installation/installationProgressReconciliation.ts'
import { startLocalService } from './http/server.ts'
import { reconcileAllSystemServices } from './runtime/service/serviceManager.ts'

registerLocalServiceProcessGuards()

void reconcileAllSystemServices()
  .then(() => reconcileInstallationProgressOnStartup())
  .then(() => reconcileBundledOmpsFirstRunOnStartup())
  .then(() => ensureServidorOmpsProvisionOnStartup())
  .then(() => ensureServidorOmpsEmbeddedRuntime())
  .finally(() => {
    startLocalService()
  })
