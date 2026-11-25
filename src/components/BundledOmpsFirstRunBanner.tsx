import { BundledOmpsNavPromo } from './BundledOmpsNavPromo.tsx'

export type BundledOmpsFirstRunBannerProps = {
  onOpenSetup: () => void
}

export function BundledOmpsFirstRunBanner({ onOpenSetup }: BundledOmpsFirstRunBannerProps) {
  return <BundledOmpsNavPromo onOpenSetup={onOpenSetup} variant="banner" />
}
