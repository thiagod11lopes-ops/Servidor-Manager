import fs from 'node:fs/promises'
import path from 'node:path'
import { getProjectDirectory, getSystemRoot } from '../installation/paths.ts'
import { discoverInstalledSystems } from '../systems/discoverInstalledSystems.ts'
import { getSystemRuntimeStatus } from '../runtime/systemProcessManager.ts'
import { formatBytes } from './format.ts'
import { measureDirectoryBytes } from './directorySizeCache.ts'
import { queryPostgresDatabaseBytes, readSupabaseStatusJson } from './supabaseLocalInspect.ts'
import type { AcompStorageDetail, StorageSizeField, SystemStorageRow } from './types.ts'

function fieldFromMeasure(
  measure: Awaited<ReturnType<typeof measureDirectoryBytes>>,
  availability: StorageSizeField['availability'] = 'measured',
): StorageSizeField {
  return {
    bytes: measure.bytes,
    label: measure.bytes != null ? formatBytes(measure.bytes) : null,
    availability: measure.bytes == null ? 'unavailable' : availability,
    detail: measure.detail,
    measuredAt: measure.measuredAt,
  }
}

async function existsDir(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p)
    return stat.isDirectory()
  } catch {
    return false
  }
}

export async function collectSystemStorageRows(): Promise<SystemStorageRow[]> {
  const discovered = await discoverInstalledSystems()
  const rows: SystemStorageRow[] = []

  for (const system of discovered) {
    const systemId = system.systemId
    const limitations: string[] = []
    const runtime = await getSystemRuntimeStatus(systemId)
    const runtimeState =
      runtime.ok && runtime.status?.state
        ? runtime.status.state
        : runtime.ok
          ? 'desconhecido'
          : 'indisponível'

    const projectDir = system.projectDirectory ?? getProjectDirectory(systemId)
    const logsDir = path.join(getSystemRoot(systemId), 'logs')
    const backupsDir = path.join(
      projectDir,
      'Transferir para Servidor',
      'servidor-lan',
      'backups',
    )
    const storageDir = path.join(projectDir, 'supabase', 'storage')

    const projectMeasure = await measureDirectoryBytes(projectDir)
    const logsMeasure = (await existsDir(logsDir)) ? await measureDirectoryBytes(logsDir) : { bytes: null, partial: false, measuredAt: null, detail: 'Sem pasta logs.' }
    const backupsMeasure = (await existsDir(backupsDir))
      ? await measureDirectoryBytes(backupsDir)
      : { bytes: null, partial: false, measuredAt: null, detail: 'Sem pasta de backups manifest.' }
    const storageMeasure = (await existsDir(storageDir))
      ? await measureDirectoryBytes(storageDir)
      : { bytes: null, partial: false, measuredAt: null, detail: 'Storage local não encontrado em disco (pode estar em volume Docker).' }

    let databaseField: StorageSizeField = {
      bytes: null,
      label: null,
      availability: 'unavailable',
      detail: 'Banco não mensurado para este perfil.',
      measuredAt: null,
    }

    if (system.serverManifestProfile === 'supabase-local-v1') {
      const supa = await readSupabaseStatusJson(systemId)
      if (supa.ok && supa.status?.DB_URL) {
        const pg = await queryPostgresDatabaseBytes(supa.status.DB_URL)
        databaseField = {
          bytes: pg.bytes,
          label: pg.bytes != null ? formatBytes(pg.bytes) : null,
          availability: pg.bytes != null ? 'measured' : 'unavailable',
          detail: pg.detail,
          measuredAt: pg.bytes != null ? new Date().toISOString() : null,
        }
      } else {
        databaseField.detail = supa.detail ?? 'Supabase local indisponível.'
      }
      limitations.push(
        'Volumes Docker compartilhados entre containers não são atribuídos integralmente a este sistema.',
      )
    }

    const componentBytes = [projectMeasure.bytes, logsMeasure.bytes, backupsMeasure.bytes].filter(
      (v): v is number => typeof v === 'number',
    )
    const totalBytes =
      componentBytes.length > 0 ? componentBytes.reduce((a, b) => a + b, 0) : null
    const totalPartial = projectMeasure.partial || logsMeasure.partial || backupsMeasure.partial
    if (totalPartial) {
      limitations.push('Total parcial: algumas pastas atingiram limite de varredura.')
    }
    limitations.push(
      'O tamanho do código em project/ não inclui necessariamente dados em volumes Docker.',
    )

    rows.push({
      systemId,
      displayName: null,
      serverManifestProfile: system.serverManifestProfile,
      runtimeState,
      projectFiles: fieldFromMeasure(projectMeasure),
      persistentData: {
        bytes: null,
        label: null,
        availability: 'unavailable',
        detail: 'Dados persistentes fora de project/ não mapeados automaticamente.',
        measuredAt: null,
      },
      database: databaseField,
      userUploads: fieldFromMeasure(storageMeasure, storageMeasure.bytes != null ? 'estimated' : 'unavailable'),
      backups: fieldFromMeasure(backupsMeasure),
      logs: fieldFromMeasure(logsMeasure),
      totalMeasured: {
        bytes: totalBytes,
        label: totalBytes != null ? formatBytes(totalBytes) : null,
        availability: totalBytes != null ? (totalPartial ? 'estimated' : 'measured') : 'unavailable',
        detail: totalPartial ? 'Soma parcial de project + logs + backups.' : 'Soma de project + logs + backups (sem banco Docker).',
        measuredAt: projectMeasure.measuredAt,
      },
      limitations,
    })
  }

  return rows
}

export async function collectAcompStorageDetail(systemId: string): Promise<AcompStorageDetail | null> {
  const discovered = await discoverInstalledSystems()
  const system = discovered.find((s) => s.systemId === systemId)
  if (!system || system.serverManifestProfile !== 'supabase-local-v1') {
    return null
  }

  const projectDir = system.projectDirectory ?? getProjectDirectory(systemId)
  const notes: string[] = [
    'Medições de disco são amostras em cache; não são executadas a cada requisição.',
    'Arquivos em volumes Docker podem não aparecer nos totais de pastas.',
  ]

  const categories: AcompStorageDetail['categories'] = []
  const add = async (id: string, title: string, dir: string, availability?: StorageSizeField['availability']) => {
    const measure = (await existsDir(dir))
      ? await measureDirectoryBytes(dir)
      : { bytes: null, partial: false, measuredAt: null, detail: 'Não encontrado.' }
    const field = fieldFromMeasure(measure, availability)
    categories.push({ id, title, field })
  }

  const supa = await readSupabaseStatusJson(systemId)
  let dbField: StorageSizeField = {
    bytes: null,
    label: null,
    availability: 'unavailable',
    detail: supa.detail ?? 'Indisponível',
    measuredAt: null,
  }
  if (supa.status?.DB_URL) {
    const pg = await queryPostgresDatabaseBytes(supa.status.DB_URL)
    dbField = {
      bytes: pg.bytes,
      label: pg.bytes != null ? formatBytes(pg.bytes) : null,
      availability: pg.bytes != null ? 'measured' : 'unavailable',
      detail: pg.detail,
      measuredAt: pg.bytes != null ? new Date().toISOString() : null,
    }
  }
  categories.push({ id: 'database', title: 'Banco PostgreSQL', field: dbField })

  await add('storage', 'Supabase Storage (pastas locais)', path.join(projectDir, 'supabase', 'storage'), 'estimated')
  await add('logs', 'Logs do sistema', path.join(getSystemRoot(systemId), 'logs'))
  await add('backups', 'Backups manifest', path.join(projectDir, 'Transferir para Servidor', 'servidor-lan', 'backups'))
  await add('temp', 'Temporários Supabase', path.join(projectDir, 'supabase', '.temp'))
  await add('project', 'Arquivos do projeto (código)', projectDir)

  const identified = categories
    .map((c) => c.field.bytes)
    .filter((b): b is number => typeof b === 'number')
  const total = identified.length ? identified.reduce((a, b) => a + b, 0) : null

  return {
    systemId,
    profile: system.serverManifestProfile,
    categories,
    totalIdentified: {
      bytes: total,
      label: total != null ? formatBytes(total) : null,
      availability: total != null ? 'estimated' : 'unavailable',
      detail: 'Soma das categorias medidas; categorias sobrepostas não são deduplicadas.',
      measuredAt: new Date().toISOString(),
    },
    notes,
  }
}
