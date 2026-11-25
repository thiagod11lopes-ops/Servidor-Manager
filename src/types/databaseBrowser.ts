export type DatabaseBrowserSystem = {
  systemId: string
  serverManifestProfile: string | null
  databaseReady: boolean
  detail: string
}

export type DatabaseBrowserTableRef = {
  schema: string
  name: string
  estimatedRows: number | null
}

export type DatabaseBrowserSchemaGroup = {
  schema: string
  tables: DatabaseBrowserTableRef[]
}

export type DatabaseBrowserColumn = {
  name: string
  dataType: string
  udtName: string
  nullable: boolean
}

export type DatabaseBrowserCatalogResponse =
  | { ok: true; schemas: DatabaseBrowserSchemaGroup[] }
  | { ok: false; code: string; message: string }

export type DatabaseBrowserMetaResponse =
  | {
      ok: true
      columns: DatabaseBrowserColumn[]
      rowCount: number | null
      rowCountExact: boolean
    }
  | { ok: false; code: string; message: string }

export type DatabaseBrowserRowsResponse =
  | {
      ok: true
      rows: Record<string, unknown>[]
      page: number
      pageSize: number
      totalRows: number | null
    }
  | { ok: false; code: string; message: string }
