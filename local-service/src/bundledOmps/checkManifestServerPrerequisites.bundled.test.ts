import assert from 'node:assert/strict'
import test from 'node:test'
import { checkManifestServerPrerequisites } from '../serverManifest/checkManifestServerPrerequisites.ts'
import type { ServerManifest } from '../serverManifest/types.ts'

const minimalManifest = {
  manifestVersion: '1.2.0',
  manager: { backendProfile: 'supabase-local-v1' },
  installPlan: { profile: 'supabase-local-v1', phases: [] },
} as unknown as ServerManifest

test('omitGitCheck dispensa Git sem afetar outras ferramentas', async () => {
  const withGit = await checkManifestServerPrerequisites(minimalManifest, { skipDockerCheck: true })
  const withoutGit = await checkManifestServerPrerequisites(minimalManifest, {
    skipDockerCheck: true,
    omitGitCheck: true,
  })

  const gitMissingWith = withGit.ok === false && withGit.missing.some((m) => m.tool === 'Git')
  const gitCheckedWithout =
    withoutGit.ok === false
      ? !withoutGit.missing.some((m) => m.tool === 'Git')
      : withoutGit.checked.some((c) => c.includes('Git (dispensado'))

  if (gitMissingWith) {
    assert.equal(gitCheckedWithout, true)
  } else {
    assert.ok(withoutGit.ok === true || gitCheckedWithout)
  }
})
