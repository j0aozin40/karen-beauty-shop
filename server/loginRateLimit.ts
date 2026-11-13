// Proteção por instância. A hospedagem ainda deve limitar abuso entre instâncias.
export class LimiteLogin {
  private falhas = new Map<string, { quantidade: number; ate: number }>()
  private maximo: number
  private janelaMs: number
  constructor(maximo = 5, janelaMs = 15 * 60 * 1000) {
    this.maximo = maximo
    this.janelaMs = janelaMs
  }

  espera(chave: string, agora = Date.now()) {
    const entrada = this.falhas.get(chave)
    if (entrada && entrada.ate <= agora) this.falhas.delete(chave)
    if (entrada && entrada.ate > agora && entrada.quantidade >= this.maximo) {
      return Math.ceil((entrada.ate - agora) / 1000)
    }
    // Limita o uso de memória sob muitas origens distintas.
    if (this.falhas.size >= 10000 && !this.falhas.has(chave)) {
      for (const [ip, item] of this.falhas) if (item.ate <= agora) this.falhas.delete(ip)
      if (this.falhas.size >= 10000) return Math.ceil(this.janelaMs / 1000)
    }
    return 0
  }

  falhou(chave: string, agora = Date.now()) {
    const anterior = this.falhas.get(chave)
    const entrada = anterior && anterior.ate > agora ? anterior : { quantidade: 0, ate: agora + this.janelaMs }
    entrada.quantidade++
    this.falhas.set(chave, entrada)
  }

  limpar(chave: string) { this.falhas.delete(chave) }
}
