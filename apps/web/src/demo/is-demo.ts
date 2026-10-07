/**
 * Modo demonstração: build com `NEXT_PUBLIC_DEMO=true`. O Next troca a variável
 * pelo valor no build, e no build normal todo `if (IS_DEMO)` vira código morto.
 *
 * Atenção ao importar os dados gravados: o webpack só descarta um `import()`
 * morto quando a condição está escrita NO PRÓPRIO LUGAR
 * (`process.env.NEXT_PUBLIC_DEMO === 'true'`). Atrás de `IS_DEMO`, que vem de
 * outro módulo, ele não enxerga a constante e empacota os dados no build normal.
 */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === 'true';

export const REPO_URL = 'https://github.com/Luan-Neumann-Dev/cifrao';
