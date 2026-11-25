export type OmpsContractAccessAvailability = 'active' | 'unavailable'

export type OmpsContractAccessStatusResponse =
  | {
      ok: true
      available: true
      loginUrl: string
      availability: OmpsContractAccessAvailability
      message: string
      checkedAt: string
      lastSuccessAt: string | null
      dashboardOrigin: string | null
      dashboardDiffersFromContract: boolean
    }
  | {
      ok: false
      available: false
      message: string
      checkedAt: string
      /** Quando conhecido, permite exibir o endereço do Usuário OMPS mesmo sem verificação HTTP. */
      loginUrl?: string
    }
