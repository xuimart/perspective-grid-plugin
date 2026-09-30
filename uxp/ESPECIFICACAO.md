# Perspective Grid para Photoshop UXP

Especificação funcional e técnica e prompt de implementação para IA

Edição 1 | 30 de setembro de 2026 | Base funcional do protótipo revisão 12

Este documento é a instrução completa para desenvolver ou adaptar o plugin Perspective Grid no projeto UXP existente. Ele define o comportamento esperado, o layout, a geometria, a integração com o documento Photoshop, as entregas e os testes. As exigências a seguir são requisitos do produto, não uma declaração de que a integração já foi implementada ou homologada.

**Instrução principal à IA:** implemente uma ferramenta utilizável dentro do Photoshop, com grade e referências 3D no canvas real do documento. Preserve o projeto UXP e sua instalação existentes. Não entregue apenas um mockup, uma página de navegador nem uma segunda área de desenho dentro do painel. Leia todas as seções antes de alterar a arquitetura.

## 1 Missão e continuidade do projeto

Quero uma ferramenta de apoio ao desenho e à ilustração que permita estudar e construir perspectiva. O usuário escolhe o modo, controla uma câmera por um cubo de orientação e visualiza uma grade coerente com modelos simples de referência. Continua pintando com as ferramentas normais do Photoshop em suas próprias camadas.

Antes de programar, examine o manifest, a estrutura, as dependências, o método de instalação, a versão do Photoshop alvo e o que já funciona na implementação UXP. Preserve o ID do plugin, entrypoints, preferências e camadas existentes. Não recrie o projeto sem necessidade nem substitua uma integração funcional por uma simulação.

Caso receba os arquivos do protótipo, use geometry.js como referência matemática, reference-scene.js como referência dos modelos e shaders, app.js como referência de interação e os testes como regressões. index.html e styles.css mostram a linguagem visual, mas não devem ser transplantados integralmente para um segundo editor no painel. A especificação deste documento prevalece sobre comportamentos experimentais antigos.

Diferencie sempre três situações na entrega: funcionalidade implementada, comportamento efetivamente testado no Photoshop e dependência ainda não validada. Não apresente testes de navegador como prova de integração com o host.

## 2 Regras que não podem ser violadas

1. Grade e modelos compartilham uma única câmera e a mesma projeção.
2. A caixa é um cubo rígido, com largura, altura e profundidade iguais no espaço 3D. Não esticar a malha para alcançar um ponto de fuga.
3. A diminuição acontece pela profundidade. Mover o objeto não altera sua escala nem suas proporções físicas.
4. Não reintroduzir câmera local por modelo, Preservar forma ou Enquadramento natural. Essas compensações foram rejeitadas por criar resultados incoerentes com a grade.
5. Modos de 1, 2 e 3 pontos são restrições persistentes. Girar ou mover não pode trocar automaticamente para Livre.
6. Zoom da cena, distância da câmera e lente são controles diferentes. Scroll não altera milímetros da lente.
7. A composição principal está no documento Photoshop. O painel contém controles, não um editor concorrente.
8. Nenhuma operação modifica a pintura do usuário ou transforma a camada de referência manualmente para fingir uma mudança de câmera.
9. Não inventar APIs de overlay, eventos globais do mouse, atalhos do host, suporte WebGL ou funcionamento de APIs sem verificar.
10. Toda falha deve permitir recuperação e preservar o documento. Não prometer ausência absoluta de bugs ou desempenho sem medição.

## 3 Adaptação dos gestos para UXP

No protótipo, os gestos ocorrem no canvas do navegador. No Photoshop, o canvas pertence ao host. A implementação obrigatória deve funcionar pelos controles do painel, com o resultado nas camadas do documento. A captura direta de gestos sobre o documento é uma melhoria condicionada à existência de uma API documentada e a uma prova funcional.

| Intenção | Implementação obrigatória no painel | Sobre o documento Photoshop |
| --- | --- | --- |
| Girar câmera | Arrastar cubo ou editar ângulos | Somente se houver captura validada |
| Mover enquadramento | Modo Mover e campos horizontal e vertical | Preservar os gestos nativos do host |
| Zoom da cena | Campo, slider e roda sobre o controle apropriado | Não interceptar a roda global |
| Shift para mover modelo | Shift no cubo ou modo Mover modelo | Não presumir que o painel recebe o gesto |
| Ctrl e Shift para profundidade | Selecionar PF e arrastar no controle | Apontar ao PF só com captura comprovada |
| Pintar | Devolver foco e preservar camada ativa | Pincel e atalhos normais do Photoshop |

O painel oferece equivalentes explícitos, utilizáveis sem teclado: Girar câmera, Mover enquadramento, Mover modelo e Profundidade. São modos do mesmo controle, não quatro áreas de desenho.

Para profundidade, um seletor apresenta os PFs atuais com rótulo, eixo e direção, como 1PF X esquerda ou 3PF Y acima. Quando apontar diretamente para um PF não estiver disponível, escolher o PF nessa lista deve produzir exatamente a mesma translação 3D. Isso é uma adaptação declarada, não deve ser apresentada como captura direta do canvas.

Atalhos são locais ao painel quando ele tem foco. A documentação de migração da Adobe diferencia eventos de teclado no painel de substituição global dos atalhos do host. Fonte: https://developer.adobe.com/uxp/migration-center/uxp-for-cep-devs/technical-migration-guide/

## 4 Layout do painel

### 4.1 Estrutura e dimensões

Criar um painel compacto em português, adequado ao dock lateral do Photoshop. Dimensões de projeto: largura preferida de 320 a 360 px, largura mínima pretendida de 280 px e uso flutuante até 480 px. Testar alturas de 480, 700 e 900 px. Esses valores são metas de layout, não garantias do gerenciador de painéis do host.

Cabeçalho, controle de orientação e ações principais permanecem acessíveis. A região de parâmetros tem rolagem vertical própria; não criar rolagem horizontal. Em altura muito pequena, reduzir o controle de orientação antes de encobrir Aplicar ou Cancelar. Campos numéricos e menus têm largura estável; labels longos podem quebrar linha sem deslocar outros controles.

### 4.2 Cabeçalho e orientação

Cabeçalho com nome do plugin, ícone de restauração e ajuda. A segunda linha mostra nome abreviado do documento, dimensões reais e um estado claro: Sem documento, Pronto, Alterações pendentes, Aplicando ou Erro. Não exibir indicadores falsos de sincronização.

Cubo com área estável de aproximadamente 140 a 170 px de altura. Identificar faces quando o texto couber; nunca sobrepor rótulos minúsculos. A orientação corresponde à câmera compartilhada, mas o indicador pode ser ortográfico para permanecer legível. Não confundir esse indicador com o modelo colocado no documento.

Atalhos Frente, Lado, Topo e Três quartos. Desabilitar vistas incompatíveis com o modo ou aplicar seus limites geométricos sem sair dele. Mostrar o motivo no tooltip de um controle bloqueado.

### 4.3 Aba Câmera

Ordem: modo de perspectiva; lente; distorção apenas no olho de peixe; zoom da cena; yaw; pitch; roll; distância; deslocamentos horizontal e vertical. Cada valor numérico importante tem campo editável e slider ou stepper. Exibir unidades mm, graus e porcentagem nos lugares corretos.

Menu de lentes com 10, 14, 24, 35, 50, 85, 135, 200 e 300 mm, além de Personalizada. Um ajuste intermediário não deve saltar para a opção mais próxima. Na Ortográfica, desabilitar lente e distorção. Pitch/roll bloqueados nos modos fixos devem refletir essa condição nos dois tipos de controle.

Zoom com valor numérico e ação 100%. Enquadrar modelo não é o mesmo comando que restaurar zoom. O painel deve permitir entender qual valor foi limitado por segurança, sem avisos repetitivos a cada pixel do arrasto.

### 4.4 Aba Grade

Perfis rápidos Limpa, Anotada e Só linhas. Depois, construção Raios de fuga ou Malha espacial; direções X, Z e Y com liga/desliga e quantidade individual; espessura; opacidade; cor geral; cor do horizonte; Mostrar horizonte; Mostrar PFs; Cores por direção; Mostrar grade.

Quantidade desabilitada quando a família estiver oculta. Informar total de guias efetivamente visíveis, sem contar horizonte, modelos ou guia temporária. Perfis não alteram lente, câmera, modelo, posições ou contagens.

### 4.5 Aba Modelo

Seleção Caixa, Mesa ou Quarto e visibilidade também acessíveis acima das abas. Na aba: escala uniforme, posição XYZ, centralizar posição, enquadrar e selecionar eixo/PF para profundidade. Os campos XYZ são uma alternativa precisa ao gesto, com validação antes de aplicar.

Não oferecer escalas X/Y/Z independentes para a caixa. Não criar uma função de esticar profundidade com Ctrl e Shift: o gesto é translação, não deformação. Mostrar nome do PF selecionado e eixo correspondente; seleção usa identidade do eixo, não o índice volátil da lista.

### 4.6 Estilo visual e acessibilidade

Interface operacional, sem hero, cartões decorativos, gradientes chamativos ou textos promocionais. Base escura próxima do Photoshop, com suporte a temas claros quando validado. Referência inicial: fundo #202325, superfície #26292B, divisória #3C4346, texto #E5E8EA, secundário #A5AFB5 e destaque #C2E09A. O tema do host tem prioridade sobre cores fixas.

Tipografia de sistema, corpo entre 11 e 13 px, títulos compactos entre 13 e 15 px, espaçamento de 4/8/12/16 px, raios de 4 a 6 px e letter spacing zero. Ícones para ações reconhecíveis, swatches para cores, controles segmentados para modos e checkboxes/toggles para estados binários. Tooltips e nomes acessíveis em todo botão sem texto.

Manter contraste, foco visível, navegação por Tab e Enter para confirmar valores. Esc cancela uma edição/gesto local; não pode disparar comando destrutivo no host. Não bloquear a rolagem do painel sobre qualquer slider: roda para zoom apenas na área explicitamente dedicada à interação da cena.

## 5 Modos e pontos de fuga

| Modo | Orientação permitida | Regra visual |
| --- | --- | --- |
| 1 ponto | Frontal fixa | Um PF de profundidade; horizontais e verticais paralelas |
| 2 pontos | Yaw; deslocamento vertical | Dois PFs laterais e verticais paralelas |
| 3 pontos | Yaw e pitch; roll zero | PFs laterais e um vertical acima ou abaixo |
| Olho de peixe | Yaw e pitch; roll zero | Curvas e direções da semiesfera frontal |
| Livre | Yaw, pitch e roll | Quantidade de PFs depende da orientação |
| Ortográfica | Orientação livre | Linhas paralelas e ausência de diminuição por profundidade |

Em 1 ponto, arrastar horizontal/verticalmente desloca enquadramento. Em 2 pontos, o horizontal gira yaw e o vertical desloca enquadramento, mantendo pitch zero. Em 3 pontos, o vertical altera pitch. Mover enquadramento continua disponível separadamente em todos os modos.

Aplicar restrições também ao carregar estados, editar números, clicar em faces, desfazer e restaurar. O protótipo evita degeneração em 2/3 pontos com yaw pelo menos 0,01 grau afastado de múltiplos de 90; em 3 pontos, pitch tem módulo mínimo de 0,1 grau e máximo de 85 graus.

## 6 Câmera e geometria

Manter um sistema de coordenadas único e documentado para mundo, câmera, documento e renderização. Usar vetores/matrizes de biblioteca 3D consolidada, preferencialmente Three.js já usado pelo protótipo.

Na perspectiva reta:

```text
focalPixels = documentWidth * focalLengthMm / 36
f = focalPixels * sceneZoom / 100
pixelX = centerX + f * cameraX / cameraZ
pixelY = centerY - f * cameraY / cameraZ
```

O sensor virtual tem 36 mm de largura; a altura acompanha o aspecto do documento. Não fixar a proporção em 16:10.

## 7 Lente e zoom independentes

- **Lente:** 10 a 300 mm.
- **Zoom da cena:** 25 a 300%.
- **Distância:** posição da câmera em unidades da maquete.

Ao trocar lente ou distorção, medir o tamanho aparente do modelo selecionado antes da mudança e ajustar somente a distância para manter aproximadamente sua maior extensão normalizada.

## 8 Olho de peixe

```text
theta = angulo entre o raio e a direcao frontal
u = sin(theta)
t = distortion / 100
r = f * (u + 0.5 * (1 - t) * u^3 * (1 - u^2))
```

Subdividir arestas e superfícies. A referência atual usa 192 intervalos por guia.

## 9 Modelos rígidos e escala

Oferecer Caixa, Mesa e Quarto. Escala uniforme 0,5 a 2,5. O cubo base mede 2 unidades em cada eixo. Cada tipo guarda sua posição XYZ independente. Renderizar modelo e guias em camadas separadas.

## 10 Movimento e profundidade

Shift e arrasto traduz o modelo num plano paralelo à câmera. Ctrl e Shift move num único eixo do mundo (profundidade por PF). Capturar estado inicial; Esc/blur/pointercancel cancelam. Plano próximo 0,12 e margem max(0,25; escala*0,5).

## 11 Grade e aparência das linhas

Três famílias X/Z/Y; 1 a 64 guias. Mesma largura e opacidade. Espessura em pixels do documento (base 1600 convertida). Opacidade 10-100% aplicada uma única vez. Perfis Limpa/Anotada/Só linhas.

## 12 Camadas e proteção do documento

```text
Perspective Grid
  Modelo de referencia
  Marcacoes
  Guias
Camadas de pintura do artista
```

Manter IDs próprios. Não assumir posse por nome. Proteger camadas de referência. RGB 8 bits é o alvo inicial.

## 13 Arquitetura recomendada

Separar núcleo geométrico, estado, interface, renderização e adaptador Photoshop. Rota recomendada para reaproveitar Three.js: WebView local com ponte de mensagens. Fazer prova de WebGL2 na versão instalada antes de adotar.

## 14 Protocolo e aplicação no host

Protocolo versionado: READY, CAPABILITIES, DOCUMENT_CONTEXT, STATE_CHANGED, RENDER_REQUEST, RENDER_RESULT, APPLY_ACK, CANCEL, ERROR. Imaging API: createImageDataFromBuffer + putPixels com IDs, replace e targetBounds. Liberar imageData em finally.

## 15 Atualização histórico e desempenho

Ao soltar (padrão) e Durante arrasto (após teste). Máximo uma escrita em andamento + intenção mais recente pendente. executeAsModal para modificar o host. Medir cada etapa separadamente.

## 16 Estado e persistência

Estado no lado UXP (não localStorage). Separar preferências, presets, estado de edição e estado aplicado por documento. UUID de instância. JSON de projeto com schemaVersion.

## 17 Valores iniciais

Modo Livre; yaw 43 / pitch 5; roll 0; lente 35 mm; distância 16; zoom 100%; pan 0; distorção 100%; caixa visível; escala 1,5; guias X/Z 16, Y 12; opacidade 80%; espessura 1,5 px; atualização Ao soltar.

## 18 Referências e exportação

Documento é a imagem de trabalho. Importar referência opcional. Exportar PNG transparente e SVG (guias, horizonte, PFs; sem modelo/referência/pintura). Dimensão padrão = documento; largura personalizada opcional.

## 19 Manifest instalação e empacotamento

Manter formato UXP do projeto. Manifest, host, ID estável. Permissões mínimas. Gerar .ccx pelo Package do UDT.

## 20 Estados de erro e recuperação

Sem documento, documento incompatível, host ocupado, camada removida, documento fechado/trocado, renderer indisponível, persistência inacessível, JSON inválido, limite de memória. Sempre preservar a arte.

## 21 Testes de aceitação obrigatórios

Geometria e modelos; interação e aparência; Photoshop e integridade. Registrar executado/aprovado, executado/falhou, não executado.

## 22 Ordem de implementação

1. Auditar UXP + prova de grade numa camada.
2. Câmera única, caixa rígida, modos, zoom/lente, aplicar ao soltar.
3. Mesa, quarto, olho de peixe, Shift, profundidade por PF, limites.
4. Controles da grade, layout responsivo, persistência, import/export, recuperação, histórico.
5. Atualização durante arrasto, homologação, empacotar .ccx.

## 23 Fontes e política de validação

Referências oficiais consultadas em 30 de setembro de 2026. Comprovam APIs documentadas, não compatibilidade automática. Esta entrega é um documento de implementação, não substitui homologação no Photoshop.
