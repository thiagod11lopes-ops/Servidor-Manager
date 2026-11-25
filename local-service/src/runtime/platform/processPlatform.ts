export type ProcessPlatform = {
  isProcessAlive(pid: number): Promise<boolean>
  terminateProcessTree(pid: number): Promise<void>
}
