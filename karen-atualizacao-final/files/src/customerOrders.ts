// Invalida consultas antigas quando a conta muda ou uma nova atualização começa.
// Evita exibir o resultado da conta anterior após logout/troca de usuário.
export function criarControlePedidos() {
  let clienteAtual: string | null = null
  let versao = 0
  return {
    definirCliente(cliente: string | null) {
      if (cliente === clienteAtual) return false
      clienteAtual = cliente
      versao++
      return true
    },
    iniciar(cliente: string | null) {
      if (!cliente || cliente !== clienteAtual) return null
      return { cliente, versao: ++versao }
    },
    atual(consulta: { cliente: string; versao: number }) {
      return consulta.cliente === clienteAtual && consulta.versao === versao
    },
  }
}
