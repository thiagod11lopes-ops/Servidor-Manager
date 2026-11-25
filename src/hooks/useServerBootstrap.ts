import { useServerBootstrapContext } from '../contexts/ServerBootstrapContext.tsx'

export function useServerBootstrap() {
  return useServerBootstrapContext()
}
