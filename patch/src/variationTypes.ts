export const variationTypes: Record<string, { label: string; field: string; placeholder: string; examples: string[] }> = {
  cor: { label: 'Cor', field: 'Nome da cor', placeholder: 'Ex.: Rosa nude', examples: ['Rosa', 'Nude', 'Vermelho', 'Marrom'] },
  tamanho: { label: 'Tamanho', field: 'Tamanho da opção', placeholder: 'Ex.: M ou 100 ml', examples: ['P', 'M', 'G', '100 ml'] },
  fragrancia: { label: 'Fragrância', field: 'Nome da fragrância', placeholder: 'Ex.: Baunilha', examples: ['Baunilha', 'Floral', 'Lavanda', 'Sem perfume'] },
  acabamento: { label: 'Acabamento', field: 'Tipo de acabamento', placeholder: 'Ex.: Matte', examples: ['Matte', 'Gloss', 'Acetinado', 'Cintilante'] },
  kit: { label: 'Kit', field: 'Nome ou composição do kit', placeholder: 'Ex.: Kit com 3 unidades', examples: ['Kit com 2 unidades', 'Kit com 3 unidades', 'Kit completo'] },
  outro: { label: 'Outra opção', field: 'Nome da opção', placeholder: 'Ex.: Modelo clássico', examples: [] },
}

export function variationColor(name: string): string | undefined {
  const colors: Record<string, string> = { rosa: '#df94ad', nude: '#cca38c', vermelho: '#ba324a', marrom: '#805445', preto: '#28242b', branco: '#fff', azul: '#6588be', verde: '#72987d', roxo: '#9a76b5', laranja: '#df925b', amarelo: '#e6c55a' }
  return colors[name.trim().toLocaleLowerCase('pt-BR')]
}
