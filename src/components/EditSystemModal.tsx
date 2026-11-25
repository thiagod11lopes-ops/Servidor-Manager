import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ManagedSystem } from '../types/system.ts'
import { isValidSourceUrlInput, normalizeUserSourceUrl, sanitizeSourceUrlInput } from '../utils/gitSourceUrl.ts'

type EditSystemModalProps = {
  open: boolean
  system: ManagedSystem | null
  onClose: () => void
  onSubmit: (systemId: string, input: { name: string; url: string }) => void
}

export function EditSystemModal({ open, system, onClose, onSubmit }: EditSystemModalProps) {
  const titleId = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [nameError, setNameError] = useState('')
  const [urlError, setUrlError] = useState('')

  useEffect(() => {
    if (!open || !system) return

    setName(system.name)
    setUrl(system.url)
    setNameError('')
    setUrlError('')
    nameRef.current?.focus()
  }, [open, system])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open || !system) return null

  const activeSystem = system
  const urlChanged = url.trim() !== activeSystem.url.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const nextName = name.trim()
    const nextUrl = normalizeUserSourceUrl(sanitizeSourceUrlInput(url))
    const nextNameError = nextName ? '' : 'Informe o nome do sistema.'
    const nextUrlError = isValidSourceUrlInput(url)
      ? ''
      : 'URL inválida. Use o link do repositório no GitHub com https:// e a branch /tree/...'

    setNameError(nextNameError)
    setUrlError(nextUrlError)

    if (nextNameError || nextUrlError) return

    onSubmit(activeSystem.id, { name: nextName, url: nextUrl })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Configurar sistema</h2>
        <p className="modal-description">
          Use a URL do repositório Git (ex. <code>https://github.com/usuario/projeto</code>), não o GitHub Pages.
        </p>
        {activeSystem.status === 'instalado' ? (
          <p className="modal-note">
            Este sistema já está instalado em disco. Alterar a URL aqui não muda a instalação existente em{' '}
            <code>C:\ServidorManager\systems\</code>.
          </p>
        ) : urlChanged ? (
          <p className="modal-note">
            Ao salvar uma URL diferente, a análise e o plano de instalação serão descartados.
          </p>
        ) : null}
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Nome do sistema</span>
            <input
              ref={nameRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
            {nameError ? <small className="field-error">{nameError}</small> : null}
          </label>
          <label className="field">
            <span>URL do repositório</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/usuario/projeto"
              autoComplete="off"
              inputMode="url"
            />
            {urlError ? <small className="field-error">{urlError}</small> : null}
          </label>
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="button button-primary">
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
