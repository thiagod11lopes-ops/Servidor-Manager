export function scrollToPageSection(elementId: string) {
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  })
}
