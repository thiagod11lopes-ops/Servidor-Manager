import { useEffect, useId } from 'react'

type AddSystemTutorialModalProps = {
  open: boolean
  onClose: () => void
}

export function AddSystemTutorialModal({ open, onClose }: AddSystemTutorialModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal-wide systems-tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>Tutorial — adicionar um sistema</h2>
        <p className="modal-description">
          Siga a ordem abaixo. Para sistemas com manifesto LAN (ex.: AcompSolemp), o Docker precisa estar{' '}
          <strong>ligado</strong> durante instalar e usar.
        </p>

        <div className="systems-tutorial-requirements">
          <div className="systems-tutorial-requirements-box systems-tutorial-requirements-running">
            <h3>Deixe aberto / em execução</h3>
            <ul>
              <li>
                <strong>Servidor Manager</strong> — abra pelo atalho na área de trabalho (não basta digitar o endereço
                no Chrome se o Manager estiver fechado).
              </li>
              <li>
                <strong>Docker Desktop</strong> — motor <strong>Running</strong> (ícone na bandeja), ao{' '}
                <strong>Analisar</strong>, <strong>Instalar</strong> e <strong>Iniciar</strong> sistemas manifest LAN.
              </li>
              <li>
                <strong>PostgreSQL</strong> — serviço do banco <strong>rodando</strong>, só se o sistema pedir banco na
                instalação.
              </li>
            </ul>
          </div>
          <div className="systems-tutorial-requirements-box systems-tutorial-requirements-installed">
            <h3>Só precisa estar instalado</h3>
            <ul>
              <li>
                <strong>Git</strong> — para baixar o código do repositório (não precisa deixar o Git aberto).
              </li>
              <li>
                <strong>Node.js e npm</strong> — no computador, quando o manifesto ou a preparação do PC pedir.
              </li>
              <li>
                <strong>Docker Desktop</strong> — instalado no Windows; para usar o sistema, além disso o motor tem de
                estar em execução (ver coluna ao lado).
              </li>
            </ul>
          </div>
        </div>

        <section className="systems-tutorial-section" aria-labelledby="tutorial-steps-heading">
          <h3 id="tutorial-steps-heading">Passo a passo no Manager</h3>
          <ol className="systems-tutorial-steps">
            <li>Abra o atalho <strong>Servidor Manager</strong> na área de trabalho.</li>
            <li>Na tela inicial, clique em <strong>Meus Sistemas</strong>.</li>
            <li>
              (Recomendado) No <strong>Dashboard</strong>, clique em <strong>Preparar este computador</strong> e aguarde
              terminar, se ainda não fez isso.
            </li>
            <li>
              Volte em <strong>Meus Sistemas</strong> e clique em <strong>+ Adicionar sistema</strong>.
            </li>
            <li>Preencha o <strong>nome</strong> e a <strong>URL do Git</strong> (branch com o manifesto) e confirme.</li>
            <li>Na lista à esquerda, clique no sistema que acabou de cadastrar.</li>
            <li>Clique em <strong>Analisar</strong> e espere acabar. Se aparecer erro, corrija o que a tela indicar.</li>
            <li>Clique em <strong>Instalar</strong>. Se pedir modo de acesso, escolha e confirme.</li>
            <li>Acompanhe a barra de progresso até concluir (com Docker ligado, se for manifest LAN).</li>
            <li>Se pedir <strong>banco de dados</strong>, preencha os dados do PostgreSQL e confirme o provisionamento.</li>
            <li>Clique em <strong>Iniciar</strong> ou <strong>Iniciar agora</strong>.</li>
            <li>
              Quando aparecer <strong>Executando</strong>, use o link de <strong>login</strong> ou de acesso na barra
              desta aba para testar.
            </li>
          </ol>
        </section>

        <p className="modal-note">
          Os arquivos ficam em <code>C:\ServidorManager\systems\</code>. Se a instalação falhar, abra a pasta de logs
          do sistema ou leia a mensagem na tela.
        </p>

        <div className="modal-actions">
          <button type="button" className="button button-primary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
