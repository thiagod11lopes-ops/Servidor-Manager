const DEFAULT_LOCAL_SERVICE_URL = 'http://127.0.0.1:47831'

export function getLocalServiceBaseUrl(): string {
  const configured = import.meta.env.VITE_LOCAL_SERVICE_URL
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '')
  }

  // Vite dev e UI estática (serve-manager-ui) fazem proxy /api/v1 na mesma origem.
  if (typeof window !== 'undefined') {
    const { port, protocol, hostname, origin } = window.location
    if (protocol === 'http:' || protocol === 'https:') {
      const isLoopback = hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
      const apiPort = '47831'
      if (import.meta.env.DEV || (isLoopback && port && port !== apiPort)) {
        return origin.replace(/\/+$/, '')
      }
    }
  }

  return DEFAULT_LOCAL_SERVICE_URL
}
