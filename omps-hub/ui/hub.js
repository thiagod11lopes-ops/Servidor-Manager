const btnServer = document.getElementById('btnServer')
const btnClient = document.getElementById('btnClient')
const btnCancel = document.getElementById('btnCancel')
const statusServer = document.getElementById('statusServer')
const statusClient = document.getElementById('statusClient')
const feedback = document.getElementById('feedback')
const versionLine = document.getElementById('versionLine')

function showFeedback(text, isError = false) {
  feedback.textContent = text
  feedback.classList.remove('hidden', 'error')
  if (isError) feedback.classList.add('error')
}

async function refreshStatus() {
  const s = await window.ompsHub.getStatus()
  versionLine.textContent = s.ompsVersion ? `Versão OMPS (payload): ${s.ompsVersion}` : ''
  btnServer.disabled = !s.serverAvailable
  btnClient.disabled = !s.clientAvailable
  statusServer.textContent = s.serverAvailable ? '' : s.serverMessage || 'Indisponível neste pacote.'
  statusClient.textContent = s.clientAvailable ? '' : s.clientMessage || 'Indisponível neste pacote.'
}

async function launch(choice) {
  feedback.classList.add('hidden')
  btnServer.disabled = true
  btnClient.disabled = true
  try {
    const result = await window.ompsHub.launch(choice)
    if (!result.ok) {
      showFeedback(result.message, true)
      await refreshStatus()
      return
    }
    showFeedback(result.message, false)
  } catch (e) {
    showFeedback(e?.message || String(e), true)
    await refreshStatus()
  }
}

btnServer.addEventListener('click', () => void launch('server'))
btnClient.addEventListener('click', () => void launch('client'))
btnCancel.addEventListener('click', () => void window.ompsHub.cancel())

void refreshStatus()
