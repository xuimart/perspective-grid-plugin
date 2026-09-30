# Perspective Grid: funcionamento e integração

Especificação vigente: revisão 12, 30/09/2026. Substitui as regras experimentais das revisões 10 e 11. Os registros de testes históricos não definem o comportamento atual.

## 1. Objetivo

O artista controla uma câmera por um cubo no painel. Grade e modelos acompanham essa câmera **no canvas do documento Photoshop**, onde o artista continua desenhando. A área grande do protótipo representa esse documento; não deve ser uma segunda área de desenho no painel final.

O cubo pequeno é um indicador ortográfico de orientação. Caixa, mesa e quarto são modelos opcionais projetados no documento. Esses dois elementos não são o mesmo objeto.

Implementado: protótipo local no navegador, grade, câmera, modelos, gestos, persistência, referência e PNG/SVG. Não implementado: manifesto UXP, instalação, transporte de pixels, manipulação de camadas ou captura de gestos no documento Photoshop.

## 2. Regra geométrica central

**Grade e modelos usam uma única câmera e projeção.** Não aplicar câmera local, deformação de vértices, escala diferente por eixo ou correção de silhueta separada do objeto.

A caixa usa `BoxGeometry(2, 2, 2)` e escala uniforme `boxSize`. Medidas da mesa, pernas, paredes e demais volumes são fixas. Translação altera somente posição. Diminuição vem da profundidade, não de reescalar a malha.

Para um ponto em coordenadas da câmera, na perspectiva reta:

```text
f = largura * focalLength / 36 * viewZoom / 100
x = cx + f * X / Z
y = cy - f * Y / Z
```

Uma face frontal diminui pela metade quando sua profundidade dobra. A silhueta não conserva proporções 2D constantes: orientação e perspectiva alteram as faces visíveis. Não corrigir isso rompendo a convergência com a grade. Usar câmera real e oferecer recuperação de enquadramento.

O renderer usa `PerspectiveCamera` e `OrthographicCamera` nativas do Three.js nos modos retos. A projeção foi comparada numericamente à grade e aos pixels renderizados. Um shader radial aplica a mesma fórmula da geometria no olho de peixe. O depth buffer resolve oclusão entre volumes.

## 3. Modos persistentes

| Modo | Gesto horizontal | Gesto vertical | Restrição |
| --- | --- | --- | --- |
| 1 ponto | Desloca enquadramento | Desloca enquadramento | yaw, pitch e roll zero. |
| 2 pontos | Gira horizontalmente | Desloca enquadramento | pitch e roll zero; verticais paralelas. |
| 3 pontos | Gira horizontalmente | Inclina | roll zero; pitch de -85 a 85 graus. |
| Olho de peixe | Gira | Inclina | roll zero; projeção radial compartilhada. |
| Livre | Gira | Inclina | roll editável. |
| Ortográfica | Gira | Inclina | Projeção paralela, sem PF finito. |

Arrastar nunca troca automaticamente para Livre. Normalização, atalhos e recarga respeitam as restrições. Para evitar degeneração de 2 e 3 PF em menos pontos, yaw mantém ao menos 0,01 grau dos múltiplos de 90; em 3 PF, pitch tem módulo mínimo de 0,1 grau.

Olho de peixe frontal tem centro, esquerda, direita, cima e baixo. Após girar, apenas direções na semiesfera frontal são marcadas; geralmente três numa vista oblíqua. Não prometer cinco marcadores sempre visíveis nem travar rotação por isso.

## 4. Lente, zoom e distorção

Lente: 10 a 300 mm, sensor virtual de 36 mm de largura. Campo horizontal sem zoom: `2 * atan(18 / mm)`. O formato do documento define a altura do sensor virtual.

`viewZoom`, de 25 a 300%, multiplica a projeção **dentro do canvas fixo**. Scroll altera somente esse valor, não lente, distância ou distorção. A referência permanece fixa. Zoom participa da exportação, mas não altera a espessura configurada.

Editar lente/distorção ajusta a distância da câmera para preservar aproximadamente a maior extensão normalizada do modelo selecionado. A busca usa amostras das arestas e mantém zoom, pan, orientação e escala. O modelo selecionado também serve de referência quando oculto. Não trava simultaneamente altura, largura e proporções internas; nos limites de distância ou segurança pode não haver correspondência exata.

Olho de peixe usa:

```text
u = sin(theta)
t = distortion / 100
r = f * (u + 0.5 * (1 - t) * u^3 * (1 - u^2))
```

A função preserva raio externo e ampliação central. É artística e idealizada; 0% ainda é curvilíneo. Guias têm 192 intervalos; superfícies/bordas são subdivididas. Não declarar calibração comercial.

Zoom/pan da janela Photoshop é outra operação: move a visualização da arte inteira sem reescrever camadas nem mudar câmera. Não interceptar globalmente o scroll do Photoshop para reproduzir o protótipo.

## 5. Movimento e segurança

**Shift + arrastar:** inverte a projeção no plano paralelo à câmera que passa pela origem do modelo. Profundidade constante, inclusive no limite XYZ: a translação inteira é limitada por um fator único, sem limitar coordenadas separadamente.

**Ctrl + Shift + arrastar:** escolhe a trajetória de um eixo XYZ cuja projeção passa pelo modelo e PF apontado. Guia curva no olho de peixe. Só uma coordenada mundial muda; eixo travado até soltar. PFs fora da tela são escolhidos pela direção visível da guia. Na ortográfica os rótulos são X/Y/Z. Eixo visto de ponta usa arrasto vertical para profundidade, inclusive no PF central do olho de peixe.

Pressionar modificadores antes do gesto. O tipo fica fixo durante o arrasto. Esc, perda de foco, cancelamento ou redimensionamento restauram o início do gesto e liberam captura. Um segundo ponteiro não assume o arrasto em andamento.

O volume completo do modelo deve ficar adiante do plano próximo de 0,12 unidade mais margem `max(0.25, boxSize * 0.5)`. Rotação, escala, lente, distância e carregamento podem afastar a câmera para respeitar a margem. O gesto de profundidade limita a posição do modelo, preservando câmera. A proteção se aplica ao modelo atualmente visível.

Posições: +/-100 unidades por eixo; pan: +/-100% do quadro; distância: 4 a 500, com mínimo efetivo dependente do volume. Valores inválidos são normalizados. Não deformar malhas para caber.

Enquadrar modelo calcula distância e pan pelos limites projetados, buscando margem de 10% em cada borda. Mantém posição 3D, lente, zoom e modo. Configurações extremas podem atingir os limites antes de caber totalmente.

Restaurar cena zera todas as posições e recupera câmera, lente, distorção, escala e zoom no modo atual. Mantém modelo escolhido, visibilidade, grade e referência carregada. Para mesa/quarto visíveis, enquadra ao final. A seta circular restaura apenas a posição do modelo.

## 6. Grade, modelos e exportação

- X, Z e Y: 1 a 64 guias por direção, espessura/opacidade uniformes. Horizonte com tracejado e cor própria.
- Raios de fuga distribui linhas pelo intervalo angular visível. Malha espacial seleciona linhas de uma malha aberta e completa famílias quando necessário.
- Coincidências são desenhadas uma vez. Eixo ortográfico visto de ponta não produz linhas. Cruzamentos/antialiasing podem alterar aparência local sem mudar largura.
- Limpa, Anotada e Só linhas não alteram câmera, modelos ou quantidades.
- Caixa, mesa e diorama têm posições independentes. O diorama é conjunto, sem seleção individual de móveis.
- PNG/SVG: largura de 2400 px, grade e marcações habilitadas. Sem modelo, referência, fundo ou guia temporária de arrasto.
- Espessura usa base de 1600 px e escala na exportação. No Photoshop, usar pixels reais do documento.
- Falha/perda de contexto WebGL exibe aviso e mantém grade/exportação; restauração do contexto solicita novo desenho.

## 7. Código e persistência

| Arquivo | Responsabilidade |
| --- | --- |
| `geometry.js` | Normalização, câmera, projeção, linhas, PFs, movimentos e SVG. |
| `reference-scene.js` | Three.js, renderer, enquadramento e proteção do volume. |
| `reference-scene.bundle.js` | Bundle local gerado por npm run build. |
| `app.js` | Interface, eventos, Canvas 2D, persistência e downloads. |
| `geometry.test.cjs` | Testes matemáticos. |
| `verify-browser.cjs` | Interações reais no navegador. |
| `verify-stability.cjs` | Raster, extremos, recuperação e exportação. |
| `audit-render.cjs` | Comparação visual de modelos e orientações. |

`yaw/pitch/roll`: orientação. `focalLength/distance/projection/distortion`: óptica. `panX/panY/viewZoom`: composição. `boxSize`: escala uniforme. `modelPositions`: vetores independentes de box/table/room. `showCube`: nome interno legado da visibilidade de qualquer modelo.

Ao abrir a revisão 12 sem estado v3, migrar somente opções da grade do v2. Câmera, modelo, posições e zoom recomeçam na base, com caixa visível. Manter v2 intacto; ignorar `preserveShape`. Gravar em `perspective-grid-prototype-v3` com debounce e ao sair. JSON inválido ou armazenamento indisponível não pode impedir uso. Referência carregada não é persistida.

O navegador guarda um estado por origem, não dados por PSD. Persistência por documento pertence ao adaptador futuro.

## 8. Photoshop: proposta não implementada

```text
Painel de controles
  -> estado normalizado + revisão
  -> geometria nas dimensões reais do documento
  -> buffers transparentes
  -> adaptador UXP
  -> camadas do documento
  -> canvas principal do Photoshop
```

Grupo próprio proposto:

```text
Perspective Grid
  Modelo de referência
  Marcações
  Guias
Camadas de pintura do artista
```

Guardar IDs explícitos de documento, grupo e camadas; nomes não comprovam propriedade. Preservar/restaurar camada de pintura selecionada. Não transformar nem apagar a arte. Excluir grupo deve interromper atualização, sem recriação silenciosa.

A Imaging API oferece `putPixels` para atualizar uma camada de pixels. Proposta: `documentID`, `layerID`, `imageData`, `replace: true` e limites explícitos, liberando dados após uso, sem acumular guias antigas. Fonte: [Adobe Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging).

Modificações no host devem usar `core.executeAsModal`, tratando cancelamento e erros. A documentação oferece suspensão/retomada de histórico e `timeOut` desde 25.10. Essa versão é candidata à prova de conceito, não homologação. Fonte: [Adobe executeAsModal](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal).

Validar renderer, buffers e eventos no runtime UXP; sucesso de WebGL2/Canvas no navegador não comprova suporte no host. Não inventar overlay nem assumir interceptação de Shift/Ctrl/scroll sobre o documento. Controles no painel podem ser usados inicialmente, mas o resultado deve aparecer no canvas principal.

## 9. Desempenho e histórico no host

- Uma escrita em andamento; somente a revisão pendente mais recente.
- Cada trabalho leva documentID, dimensões, revisão e IDs de camadas. Invalidar ao trocar/fechar/redimensionar documento.
- Geometria fora do escopo modal. Operações modais curtas, canceláveis e com liberação de buffers.
- Começar aplicando ao soltar numa transação de desfazer. Medir antes de prometer atualização contínua ou taxa de quadros.
- Buffer RGBA 6000 × 4000 de 8 bits usa 96 MB, sem cópias. Orçar por camada; tiles exigem substituição explícita.
- Coordenadas/resolução são do documento, não tela, DPI do Windows ou zoom da janela.
- Primeiro alvo proposto: RGB 8 bits simples. Testar outros modos, perfis e artboards sem converter pintura automaticamente.
- Persistência por documento deve tratar PSD não salvo, duplicado e reaberto. Escolher metadados/arquivo auxiliar após prova real.

## 10. Critérios de aceitação

Navegador: medidas rígidas, convergência das arestas/PFs, diminuição, modos, lente/zoom, gestos interrompidos, estados inválidos, PNG/SVG e pixels em diferentes tamanhos de tela. Resultados: [VALIDACAO.md](VALIDACAO.md).

Photoshop: documento correto, preservação de pintura/seleção, camadas alteradas durante arrasto, troca/fechamento de documento, desfazer/refazer/cancelar, host ocupado, cor/alpha, memória/tempo em documentos grandes e recuperação de PSD. Nenhum teste de navegador substitui homologação no host.

Não há encaixe automático do pincel, seleção individual de móveis, integração UXP instalada ou garantia de ausência absoluta de bugs.
