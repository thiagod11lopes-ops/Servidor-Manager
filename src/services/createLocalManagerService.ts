import { HttpLocalManagerClient } from './httpLocalManagerClient.ts'
import { HybridLocalManagerService } from './hybridLocalManagerService.ts'
import type { LocalManagerService } from './localManagerService.ts'
import { MockLocalManagerService } from './mockLocalManagerService.ts'

export function createLocalManagerService(): LocalManagerService {
  return new HybridLocalManagerService(new HttpLocalManagerClient(), new MockLocalManagerService())
}
