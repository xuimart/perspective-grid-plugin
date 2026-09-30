# Perspective Grid - revisão 12

Abra `index.html` ou `Abrir.cmd`. O protótipo funciona localmente, sem servidor e sem internet. Os modelos usam Three.js incluído no pacote e precisam de WebGL2 no navegador.

## O que foi restaurado

- Uma única câmera para grade e modelos. Não há câmera local, "Preservar forma" nem "Enquadramento natural".
- A caixa é um cubo de 2 × 2 × 2 unidades, com escala uniforme. Mover e alterar profundidade não modificam suas medidas.
- A câmera não pode atravessar um modelo visível. Rotação, tamanho, distância, lente e carregamento respeitam o volume completo, não somente sua origem.
- "Restaurar cena" recupera câmera, zoom, tamanho e posições de todos os modelos, mantendo modo, modelo selecionado e opções da grade.

Na primeira abertura desta revisão, câmera e posições antigas são reiniciadas para evitar recuperar configurações experimentais. Cores, espessura, quantidades e visibilidade da grade são preservadas. O estado anterior continua guardado na chave local `perspective-grid-prototype-v2`; os novos ajustes usam `perspective-grid-prototype-v3`.

## Controles

| Ação | Resultado |
| --- | --- |
| Arrastar cena ou cubo do painel | Controlar a câmera conforme o modo. |
| Mover, botão direito ou do meio | Deslocar o enquadramento inteiro. |
| Shift + arrastar | Mover somente o modelo num plano paralelo à câmera. |
| Ctrl + Shift + arrastar | Seguir um eixo do PF apontado, com guia temporária. |
| Roda do mouse | Zoom de 25 a 300% dentro do canvas fixo, sem alterar a lente. |
| Lente | 10 a 300 mm; compensa distância para manter aproximadamente o tamanho aparente. |
| Distorção | Ajustar curvatura no olho de peixe, mantendo o zoom. |
| Seta circular junto ao modelo | Zerar somente a posição do modelo selecionado. |
| Enquadrar modelo | Ajustar distância e pan; não move a posição 3D nem altera lente ou zoom. |
| Restaurar cena / R | Recuperar câmera, zoom, tamanho e posições. |
| Esc durante arrasto | Cancelar e recuperar o estado inicial do gesto. |

Pressione os modificadores **antes** do arrasto. Tipo de gesto e eixo escolhido ficam fixos até soltar. Para trocar de PF, solte e inicie outro gesto apontando para sua direção. Se o eixo estiver exatamente de frente, o arrasto vertical controla a profundidade, inclusive no PF central do olho de peixe.

Perder o foco da janela, cancelar o ponteiro ou redimensionar durante um arrasto cancela o gesto sem deixá-lo preso. Atalhos não são acionados enquanto você edita um campo numérico.

## Modos

- **1 ponto:** orientação frontal fixa. Arrastar desloca enquadramento, sem criar outros PFs.
- **2 pontos:** gira horizontalmente; arrastar verticalmente desloca enquadramento. Verticais paralelas.
- **3 pontos:** gira e inclina; terceiro PF acima ou abaixo. Não muda automaticamente para Livre.
- **Olho de peixe:** permite girar e deslocar. A vista frontal tem cinco PFs; após girar, apenas direções da semiesfera frontal são marcadas. Distorção artística, não lente comercial calibrada; 0% ainda é curvilíneo.
- **Livre:** permite editar todos os ângulos.
- **Ortográfica:** linhas paralelas, sem diminuição por profundidade.

## Grade e modelos

Escolha de 1 a 64 guias por direção X, Z e Y. Todas usam a mesma espessura/opacidade. Horizonte tem cor própria e tracejado. Linhas coincidentes são desenhadas uma vez; o total visível pode ser menor que a soma dos controles.

Raios de fuga distribui linhas no quadro; Malha espacial seleciona linhas de uma malha 3D aberta. Perfis Limpa, Anotada e Só linhas não alteram câmera nem modelo.

Caixa, mesa e quarto têm posições independentes. O quarto é um diorama simplificado com piso, duas paredes e móveis; ele se move como conjunto, sem seleção individual dos móveis. O cubo pequeno do painel é apenas o controle de orientação.

## Exportação e Photoshop

PNG transparente e SVG exportam **somente grade e marcações habilitadas**, com 2400 px de largura. Não incluem modelos, imagem de referência nem fundo. Para somente linhas, selecione Só linhas. O zoom da cena entra na projeção exportada.

O protótipo **não está integrado ao Photoshop**. A integração planejada deve colocar grade e referências no **canvas do documento Photoshop**, mantendo apenas controles no painel. Não criar uma segunda área de desenho dentro do plugin. Veja [FUNCIONAMENTO-DO-PLUGIN.md](FUNCIONAMENTO-DO-PLUGIN.md).

## Limites e recuperação

A perspectiva é calculada em 3D, sem deformar a malha para corrigir sua silhueta na tela. Lentes abertas, pontos muito fora do quadro e vistas próximas continuam produzindo projeções fortes. Se perder o enquadramento, use Enquadrar modelo; para reiniciar também posições e lente, use Restaurar cena.

Distância: 4 a 500 unidades; posições XYZ: -100 a 100; pan: -100% a 100%. Perto desses limites, nem sempre é possível preservar simultaneamente tamanho aparente, lente e zoom. A proteção contra atravessar o modelo tem prioridade. A distância mínima efetiva varia com tamanho e orientação.

Ajustes são salvos no navegador quando o armazenamento está disponível. A imagem de referência não é persistida. Se o WebGL falhar, grade e exportação permanecem disponíveis e aparece um aviso para o modelo.

## Desenvolvimento e testes

`npm ci` instala dependências de desenvolvimento. `npm run build` recompila o renderer. O pacote pronto não exige esses comandos para abrir.

- `npm test`: testes da geometria.
- `npm run test:browser`: interação, lente, zoom, movimento, SVG e persistência.
- `npm run test:stability`: pixels, extremos, recuperação, PNG, WebGL e tamanhos de tela.
- `npm run audit:visual`: folha comparativa dos modelos em quatro orientações.

Os testes de navegador precisam de Playwright e Edge instalados. `PLAYWRIGHT_MODULE` pode apontar para um módulo Playwright disponível fora do projeto. Resultados e limites: [VALIDACAO.md](VALIDACAO.md).

`mockup.html` é somente o estudo visual inicial. A versão funcional é `index.html`.
