
export type Variation = { id: string; tipo: string; nome: string; sku?: string | null; stock: number; price: number; imagem?: string | null }
export type Product = {
  controla_variacoes?: boolean
  variacoes?: Variation[]
  variationId?: string
  variationName?: string
  id: number
  name: string
  category: string
  price: number
  description: string
  emoji: string
  stock: number
  imagem?: string | null
}

export const products: Product[] = [
  // SOBRANCELHAS
  { id: 1, name: 'Henna para Sobrancelhas', category: 'Sobrancelhas', price: 29.90, description: 'Realce e definição para as sobrancelhas.', emoji: '🤎', stock: 5 },
  { id: 2, name: 'Lápis para Sobrancelhas', category: 'Sobrancelhas', price: 14.90, description: 'Preenchimento natural e preciso.', emoji: '✏️', stock: 5 },
  { id: 3, name: 'Gel Fixador de Sobrancelhas', category: 'Sobrancelhas', price: 19.90, description: 'Ajuda a alinhar e fixar os fios.', emoji: '✨', stock: 5 },
  { id: 4, name: 'Escovinha para Sobrancelhas', category: 'Sobrancelhas', price: 2.90, description: 'Ideal para pentear os fios.', emoji: '🪄', stock: 10 },
  { id: 5, name: 'Kit Escovinhas Descartáveis', category: 'Sobrancelhas', price: 9.90, description: 'Kit para cuidados e procedimentos.', emoji: '🩷', stock: 5 },
  { id: 6, name: 'Pinça Ponta Reta', category: 'Sobrancelhas', price: 12.90, description: 'Auxilia na remoção de pelos.', emoji: '✂️', stock: 5 },
  { id: 7, name: 'Pinça Ponta Fina', category: 'Sobrancelhas', price: 14.90, description: 'Precisão para pelos pequenos.', emoji: '✂️', stock: 5 },
  { id: 8, name: 'Navalhete para Sobrancelhas', category: 'Sobrancelhas', price: 9.90, description: 'Acessório para acabamento.', emoji: '🪒', stock: 5 },
  { id: 9, name: 'Tesourinha para Sobrancelhas', category: 'Sobrancelhas', price: 16.90, description: 'Auxilia no acabamento dos fios.', emoji: '✂️', stock: 3 },
  { id: 10, name: 'Pasta Delineadora', category: 'Sobrancelhas', price: 24.90, description: 'Auxilia na marcação do design.', emoji: '🤎', stock: 3 },
  { id: 11, name: 'Paquímetro para Design', category: 'Sobrancelhas', price: 12.90, description: 'Instrumento para medidas.', emoji: '📏', stock: 3 },
  { id: 12, name: 'Linha para Marcação', category: 'Sobrancelhas', price: 16.90, description: 'Linha para marcação do design.', emoji: '🧵', stock: 3 },
  { id: 13, name: 'Corretivo para Sobrancelhas', category: 'Sobrancelhas', price: 19.90, description: 'Acabamento e definição.', emoji: '💄', stock: 4 },
  { id: 14, name: 'Sombra para Sobrancelhas', category: 'Sobrancelhas', price: 22.90, description: 'Preenchimento e definição.', emoji: '🤎', stock: 4 },
  { id: 15, name: 'Kit Laminação de Sobrancelhas', category: 'Sobrancelhas', price: 69.90, description: 'Kit para procedimento profissional.', emoji: '✨', stock: 2 },
  { id: 16, name: 'Espelho de Aumento', category: 'Sobrancelhas', price: 19.90, description: 'Auxilia na visualização dos detalhes.', emoji: '🪞', stock: 3 },
  { id: 17, name: 'Anel Porta Henna', category: 'Sobrancelhas', price: 8.90, description: 'Acessório para uso profissional.', emoji: '💍', stock: 5 },
  { id: 18, name: 'Kit Design Básico', category: 'Sobrancelhas', price: 39.90, description: 'Acessórios essenciais para design.', emoji: '🎀', stock: 3 },

  // CÍLIOS
  { id: 19, name: 'Cílios Postiços Naturais', category: 'Cílios', price: 16.90, description: 'Efeito delicado para o olhar.', emoji: '👁️', stock: 5 },
  { id: 20, name: 'Cílios Postiços Volume', category: 'Cílios', price: 19.90, description: 'Mais destaque para a maquiagem.', emoji: '👁️', stock: 5 },
  { id: 21, name: 'Cílios em Tufinhos', category: 'Cílios', price: 22.90, description: 'Aplicação personalizada.', emoji: '✨', stock: 5 },
  { id: 22, name: 'Cola para Cílios Postiços', category: 'Cílios', price: 19.90, description: 'Cola para cílios postiços.', emoji: '🩷', stock: 4 },
  { id: 23, name: 'Aplicador de Cílios', category: 'Cílios', price: 12.90, description: 'Facilita a aplicação dos cílios.', emoji: '🪄', stock: 4 },
  { id: 24, name: 'Pinça para Cílios', category: 'Cílios', price: 24.90, description: 'Precisão para aplicação.', emoji: '✂️', stock: 3 },
  { id: 25, name: 'Escovinhas para Cílios', category: 'Cílios', price: 9.90, description: 'Escovinhas para organização dos fios.', emoji: '🩷', stock: 5 },
  { id: 26, name: 'Fita Micropore', category: 'Cílios', price: 12.90, description: 'Material auxiliar para procedimentos.', emoji: '🎀', stock: 4 },
  { id: 27, name: 'Pads para Cílios', category: 'Cílios', price: 19.90, description: 'Acessório para procedimentos.', emoji: '☁️', stock: 4 },
  { id: 28, name: 'Shampoo para Cílios', category: 'Cílios', price: 29.90, description: 'Produto para higienização dos cílios.', emoji: '🧴', stock: 3 },
  { id: 29, name: 'Pincel para Higienização', category: 'Cílios', price: 12.90, description: 'Auxilia na limpeza dos fios.', emoji: '🖌️', stock: 4 },
  { id: 30, name: 'Removedor de Cola', category: 'Cílios', price: 29.90, description: 'Produto auxiliar para remoção.', emoji: '🧴', stock: 2 },
  { id: 31, name: 'Bandeja para Cílios', category: 'Cílios', price: 34.90, description: 'Bandeja para organização profissional.', emoji: '👁️', stock: 3 },
  { id: 32, name: 'Kit Cílios Postiços', category: 'Cílios', price: 39.90, description: 'Seleção de cílios para maquiagem.', emoji: '🎀', stock: 3 },
  { id: 33, name: 'Curvador de Cílios', category: 'Cílios', price: 17.90, description: 'Ajuda a curvar os cílios naturais.', emoji: '✨', stock: 4 },
  { id: 34, name: 'Mini Ventilador para Cílios', category: 'Cílios', price: 49.90, description: 'Equipamento auxiliar profissional.', emoji: '🌸', stock: 2 },
  { id: 35, name: 'Pedra Jade para Cílios', category: 'Cílios', price: 19.90, description: 'Acessório para procedimentos.', emoji: '💎', stock: 2 },

  // SKINCARE
  { id: 36, name: 'Sérum Facial Vitamina C', category: 'Skincare', price: 32.90, description: 'Cuidado diário para a pele.', emoji: '✨', stock: 4 },
  { id: 37, name: 'Água Micelar', category: 'Skincare', price: 21.90, description: 'Limpeza facial suave.', emoji: '🧴', stock: 4 },
  { id: 38, name: 'Sabonete Facial', category: 'Skincare', price: 24.90, description: 'Limpeza para a rotina facial.', emoji: '🫧', stock: 4 },
  { id: 39, name: 'Hidratante Facial', category: 'Skincare', price: 34.90, description: 'Hidratação para o rosto.', emoji: '🌸', stock: 4 },
  { id: 40, name: 'Protetor Solar Facial', category: 'Skincare', price: 49.90, description: 'Proteção solar para a pele.', emoji: '☀️', stock: 3 },
  { id: 41, name: 'Máscara Facial de Argila', category: 'Skincare', price: 19.90, description: 'Máscara para rotina de cuidados.', emoji: '🌿', stock: 4 },
  { id: 42, name: 'Esfoliante Facial', category: 'Skincare', price: 27.90, description: 'Esfoliação para cuidados da pele.', emoji: '🌷', stock: 3 },
  { id: 43, name: 'Tônico Facial', category: 'Skincare', price: 25.90, description: 'Complemento da limpeza facial.', emoji: '💧', stock: 3 },
  { id: 44, name: 'Lip Balm Hidratante', category: 'Skincare', price: 12.90, description: 'Cuidado diário para os lábios.', emoji: '💋', stock: 5 },
  { id: 45, name: 'Máscara Labial', category: 'Skincare', price: 16.90, description: 'Tratamento cosmético labial.', emoji: '🩷', stock: 4 },
  { id: 46, name: 'Creme para Área dos Olhos', category: 'Skincare', price: 39.90, description: 'Cuidado para a região dos olhos.', emoji: '👁️', stock: 2 },
  { id: 47, name: 'Sérum Ácido Hialurônico', category: 'Skincare', price: 34.90, description: 'Sérum para rotina de hidratação.', emoji: '💧', stock: 3 },
  { id: 48, name: 'Máscara Facial de Tecido', category: 'Skincare', price: 9.90, description: 'Máscara facial de uso individual.', emoji: '🌸', stock: 6 },
  { id: 49, name: 'Demaquilante', category: 'Skincare', price: 24.90, description: 'Auxilia na remoção da maquiagem.', emoji: '🧴', stock: 3 },
  { id: 50, name: 'Esponja de Limpeza Facial', category: 'Skincare', price: 12.90, description: 'Acessório para limpeza facial.', emoji: '🫧', stock: 4 },
  { id: 51, name: 'Rolo Massageador Facial', category: 'Skincare', price: 29.90, description: 'Acessório para massagem facial.', emoji: '🌷', stock: 3 },
  { id: 52, name: 'Água Termal', category: 'Skincare', price: 29.90, description: 'Produto refrescante para a pele.', emoji: '💦', stock: 3 },
  { id: 53, name: 'Kit Rotina de Skincare', category: 'Skincare', price: 79.90, description: 'Kit para cuidados diários.', emoji: '🎀', stock: 2 },

  // MAQUIAGEM
  { id: 54, name: 'Gloss Labial Hidratante', category: 'Maquiagem', price: 19.90, description: 'Brilho delicado para os lábios.', emoji: '💄', stock: 5 },
  { id: 55, name: 'Batom Matte', category: 'Maquiagem', price: 22.90, description: 'Cor e acabamento matte.', emoji: '💋', stock: 4 },
  { id: 56, name: 'Máscara de Cílios', category: 'Maquiagem', price: 24.90, description: 'Realce para os cílios.', emoji: '🖤', stock: 5 },
  { id: 57, name: 'Blush Compacto', category: 'Maquiagem', price: 26.90, description: 'Cor para realçar as maçãs do rosto.', emoji: '🌸', stock: 4 },
  { id: 58, name: 'Corretivo Líquido', category: 'Maquiagem', price: 29.90, description: 'Acabamento uniforme para maquiagem.', emoji: '✨', stock: 4 },
  { id: 59, name: 'Base Líquida', category: 'Maquiagem', price: 39.90, description: 'Cobertura para a maquiagem.', emoji: '💄', stock: 4 },
  { id: 60, name: 'Pó Compacto', category: 'Maquiagem', price: 29.90, description: 'Finalização da maquiagem.', emoji: '🌷', stock: 3 },
  { id: 61, name: 'Pó Translúcido', category: 'Maquiagem', price: 32.90, description: 'Finalização leve da maquiagem.', emoji: '🤍', stock: 3 },
  { id: 62, name: 'Paleta de Sombras', category: 'Maquiagem', price: 39.90, description: 'Cores para diferentes produções.', emoji: '🎨', stock: 3 },
  { id: 63, name: 'Delineador Líquido', category: 'Maquiagem', price: 19.90, description: 'Traço preciso para os olhos.', emoji: '🖤', stock: 4 },
  { id: 64, name: 'Lápis de Olho', category: 'Maquiagem', price: 14.90, description: 'Definição para o olhar.', emoji: '✏️', stock: 4 },
  { id: 65, name: 'Iluminador Facial', category: 'Maquiagem', price: 29.90, description: 'Toque iluminado na maquiagem.', emoji: '✨', stock: 3 },
  { id: 66, name: 'Contorno Facial', category: 'Maquiagem', price: 29.90, description: 'Produto para contorno facial.', emoji: '🤎', stock: 3 },
  { id: 67, name: 'Fixador de Maquiagem', category: 'Maquiagem', price: 32.90, description: 'Finalização da maquiagem.', emoji: '💦', stock: 3 },
  { id: 68, name: 'Primer Facial', category: 'Maquiagem', price: 34.90, description: 'Preparação para maquiagem.', emoji: '🌸', stock: 3 },
  { id: 69, name: 'Lápis Labial', category: 'Maquiagem', price: 12.90, description: 'Contorno e definição dos lábios.', emoji: '💋', stock: 4 },
  { id: 70, name: 'Paleta de Blush', category: 'Maquiagem', price: 39.90, description: 'Cores para diferentes looks.', emoji: '🎨', stock: 2 },
  { id: 71, name: 'Kit Maquiagem Básica', category: 'Maquiagem', price: 89.90, description: 'Seleção de itens para maquiagem.', emoji: '🎀', stock: 2 },
  { id: 72, name: 'Sombra Líquida', category: 'Maquiagem', price: 24.90, description: 'Brilho e cor para os olhos.', emoji: '✨', stock: 3 },
  { id: 73, name: 'Lip Tint', category: 'Maquiagem', price: 19.90, description: 'Cor leve para os lábios.', emoji: '💗', stock: 4 },

  // ACESSÓRIOS
  { id: 74, name: 'Esponja para Maquiagem', category: 'Acessórios', price: 12.90, description: 'Aplicação uniforme de maquiagem.', emoji: '🩷', stock: 5 },
  { id: 75, name: 'Kit Pincéis de Maquiagem', category: 'Acessórios', price: 34.90, description: 'Kit de pincéis para maquiagem.', emoji: '🖌️', stock: 4 },
  { id: 76, name: 'Necessaire Feminina', category: 'Acessórios', price: 29.90, description: 'Organize seus produtos de beleza.', emoji: '🎀', stock: 3 },
  { id: 77, name: 'Espelho de Bolsa', category: 'Acessórios', price: 14.90, description: 'Espelho compacto para levar na bolsa.', emoji: '🪞', stock: 5 },
  { id: 78, name: 'Faixa de Cabelo para Skincare', category: 'Acessórios', price: 19.90, description: 'Acessório para rotina facial.', emoji: '🌸', stock: 4 },
  { id: 79, name: 'Touca de Cetim', category: 'Acessórios', price: 24.90, description: 'Acessório para cuidados capilares.', emoji: '🎀', stock: 3 },
  { id: 80, name: 'Organizador de Maquiagem', category: 'Acessórios', price: 39.90, description: 'Organização para seus produtos.', emoji: '🧺', stock: 2 },
  { id: 81, name: 'Bolsa Necessaire Transparente', category: 'Acessórios', price: 22.90, description: 'Praticidade para guardar cosméticos.', emoji: '🩷', stock: 3 },
  { id: 82, name: 'Pente para Sobrancelhas', category: 'Acessórios', price: 9.90, description: 'Acessório compacto para acabamento.', emoji: '🪄', stock: 5 },
  { id: 83, name: 'Tiara de Maquiagem', category: 'Acessórios', price: 16.90, description: 'Mantém os cabelos afastados do rosto.', emoji: '🌷', stock: 4 },
  { id: 84, name: 'Porta Joias Pequeno', category: 'Acessórios', price: 34.90, description: 'Organizador compacto de acessórios.', emoji: '💍', stock: 2 },
  { id: 85, name: 'Kit Acessórios de Beleza', category: 'Acessórios', price: 49.90, description: 'Seleção de acessórios para rotina de beleza.', emoji: '🎁', stock: 2 },

  // LINHA PROFISSIONAL
  { id: 86, name: 'Pinça Profissional', category: 'Linha profissional', price: 22.90, description: 'Precisão para procedimentos de design.', emoji: '✂️', stock: 3 },
  { id: 87, name: 'Kit Design Profissional', category: 'Linha profissional', price: 89.90, description: 'Acessórios para profissionais.', emoji: '🎀', stock: 2 },
  { id: 88, name: 'Paquímetro Profissional', category: 'Linha profissional', price: 19.90, description: 'Instrumento para medidas.', emoji: '📏', stock: 2 },
  { id: 89, name: 'Linha de Marcação Profissional', category: 'Linha profissional', price: 19.90, description: 'Linha para marcação de design.', emoji: '🧵', stock: 3 },
  { id: 90, name: 'Kit Henna Profissional', category: 'Linha profissional', price: 79.90, description: 'Kit para uso profissional.', emoji: '🤎', stock: 2 },
  { id: 91, name: 'Luminária de Mesa LED', category: 'Linha profissional', price: 89.90, description: 'Iluminação auxiliar para atendimento.', emoji: '💡', stock: 1 },
  { id: 92, name: 'Suporte para Pinças', category: 'Linha profissional', price: 19.90, description: 'Organização de instrumentos.', emoji: '🧰', stock: 2 },
  { id: 93, name: 'Bandeja Organizadora', category: 'Linha profissional', price: 29.90, description: 'Organização da bancada profissional.', emoji: '🧺', stock: 2 },
  { id: 94, name: 'Anel Porta Cola', category: 'Linha profissional', price: 9.90, description: 'Acessório auxiliar para aplicação.', emoji: '💍', stock: 4 },
  { id: 95, name: 'Kit Escovinhas Descartáveis', category: 'Linha profissional', price: 14.90, description: 'Material auxiliar para atendimentos.', emoji: '🩷', stock: 5 },
  { id: 96, name: 'Microbrush Descartável', category: 'Linha profissional', price: 14.90, description: 'Aplicadores para procedimentos.', emoji: '🪄', stock: 5 },
  { id: 97, name: 'Fita Micropore Profissional', category: 'Linha profissional', price: 14.90, description: 'Material auxiliar para procedimentos.', emoji: '🎀', stock: 4 },
  { id: 98, name: 'Kit Higienização de Cílios', category: 'Linha profissional', price: 49.90, description: 'Produtos para higienização.', emoji: '🧴', stock: 2 },
  { id: 99, name: 'Espelho Auxiliar Profissional', category: 'Linha profissional', price: 24.90, description: 'Acessório para conferência do trabalho.', emoji: '🪞', stock: 2 },
  { id: 100, name: 'Avental para Profissional', category: 'Linha profissional', price: 39.90, description: 'Avental para rotina de atendimento.', emoji: '🤍', stock: 2 },
  { id: 101, name: 'Organizador de Bancada', category: 'Linha profissional', price: 49.90, description: 'Organização de materiais de trabalho.', emoji: '🧺', stock: 2 },
  { id: 102, name: 'Kit Aplicadores Profissionais', category: 'Linha profissional', price: 24.90, description: 'Aplicadores para procedimentos.', emoji: '🖌️', stock: 3 },
  { id: 103, name: 'Pincel Profissional de Precisão', category: 'Linha profissional', price: 19.90, description: 'Pincel para detalhes e acabamento.', emoji: '🖌️', stock: 3 },
  { id: 104, name: 'Carrinho Auxiliar de Beleza', category: 'Linha profissional', price: 149.90, description: 'Móvel auxiliar para espaço profissional.', emoji: '🛒', stock: 1 },
  { id: 105, name: 'Kit Completo para Designer', category: 'Linha profissional', price: 129.90, description: 'Seleção de acessórios para designer.', emoji: '🎁', stock: 1 },
]
