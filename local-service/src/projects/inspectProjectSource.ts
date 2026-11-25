import { checkoutGitSource, removeCheckout } from '../sources/gitCloneSource.ts'
import { extractGitRef, validateSourceUrl } from '../sources/validateSourceUrl.ts'
import { inspectProjectDirectory } from './inspectProjectDirectory.ts'

export async function inspectProjectSource(sourceUrl: string) {
  const parsedUrl = validateSourceUrl(sourceUrl)
  const gitRef = extractGitRef(parsedUrl)
  const checkout = await checkoutGitSource(sourceUrl)

  try {
    return await inspectProjectDirectory({
      projectDir: checkout.projectDir,
      sourceUrl: checkout.remoteUrl,
      gitRef,
    })
  } finally {
    await removeCheckout(checkout.workDir)
  }
}
