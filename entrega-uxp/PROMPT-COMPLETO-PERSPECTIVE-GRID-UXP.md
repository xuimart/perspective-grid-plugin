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

Atalhos são locais ao painel quando ele tem foco. A documentação de migração da Adobe diferencia eventos de teclado no painel de substituição global dos atalhos do host. Fonte: [Teclado na migração CEP para UXP](https://developer.adobe.com/uxp/migration-center/uxp-for-cep-devs/technical-migration-guide/).

## 4 Layout do painel

### 4.1 Estrutura e dimensões

Criar um painel compacto em português, adequado ao dock lateral do Photoshop. Dimensões de projeto: largura preferida de 320 a 360 px, largura mínima pretendida de 280 px e uso flutuante até 480 px. Testar alturas de 480, 700 e 900 px. Esses valores são metas de layout, não garantias do gerenciador de painéis do host.

Cabeçalho, controle de orientação e ações principais permanecem acessíveis. A região de parâmetros tem rolagem vertical própria; não criar rolagem horizontal. Em altura muito pequena, reduzir o controle de orientação antes de encobrir Aplicar ou Cancelar. Campos numéricos e menus têm largura estável; labels longos podem quebrar linha sem deslocar outros controles.

Wireframe funcional do painel lateral:

```text
Perspective Grid        Restaurar    Ajuda
Documento ativo e dimensoes

          Cubo de orientacao
     Frente   Lado   Topo   Tres quartos
Girar | Enquadramento | Modelo | Profundidade

Modelo 3D  [ligado]  [Caixa / Mesa / Quarto]
Escala uniforme     Centralizar   Enquadrar

Camera | Grade | Modelo
-------------------------------------------
Conteudo da aba com rolagem vertical
-------------------------------------------
Ao soltar / Durante arrasto
Status de sincronizacao
Aplicar   Cancelar   Exportar
```

Esse desenho é uma hierarquia, não uma prescrição de bordas decorativas. Não incluir o retângulo grande da composição do navegador. Se existir uma miniatura auxiliar no painel, ela é opcional, pequena e não substitui o documento.

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

Tipografia de sistema, corpo entre 11 e 13 px, títulos compactos entre 13 e 15 px, espaçamento de 4/8/12/16 px, raios de 4 a 6 px e letter spacing zero. Ícones para ações reconhecíveis, swatches para cores, controles segmentados para modos e checkboxes/toggles para estados binários. Preferir a biblioteca existente ou ícones Lucide locais no conteúdo web. Tooltips e nomes acessíveis em todo botão sem texto.

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

Aplicar restrições também ao carregar estados, editar números, clicar em faces, desfazer e restaurar. O protótipo evita degeneração em 2/3 pontos com yaw pelo menos 0,01 grau afastado de múltiplos de 90; em 3 pontos, pitch tem módulo mínimo de 0,1 grau e máximo de 85 graus. Manter essa regra ou substituí-la por solução equivalente testada que não crie saltos de orientação.

Os números 1PF, 2PF e 3PF identificam direções naquele modo, não posições que possam ser arrastadas independentemente da câmera. Marcadores fora do documento viram setas na borda; seu valor matemático continua fora. Colocar o marcador na borda não altera a fuga real.

No olho de peixe frontal há PF central e quatro laterais. Após girar, alguns eixos saem da semiesfera frontal; a marcação deve refletir isso, sem inventar PFs nem impedir rotação. Direções opostas do mesmo eixo continuam pertencendo à mesma coordenada mundial.

## 6 Câmera e geometria

Manter um sistema de coordenadas único e documentado para mundo, câmera, documento e renderização. Usar vetores/matrizes de biblioteca 3D consolidada, preferencialmente Three.js já usado pelo protótipo. Não criar uma nova pseudo-perspectiva baseada em desenhar trapézios 2D.

Na perspectiva reta, transformar o ponto mundial pela câmera e projetar com o mesmo centro e escala para grade e modelos:

```text
focalPixels = documentWidth * focalLengthMm / 36
f = focalPixels * sceneZoom / 100
pixelX = centerX + f * cameraX / cameraZ
pixelY = centerY - f * cameraY / cameraZ
```

O sensor virtual tem 36 mm de largura; a altura acompanha o aspecto do documento. Não fixar a proporção em 16:10. O deslocamento da projeção e as matrizes do renderer precisam usar a mesma convenção de sinais. Comparar pontos projetados pelos dois caminhos com tolerância numérica definida.

Na Ortográfica, a projeção não divide por Z. O modelo pode ir mais fundo, mas não diminuir. Na perspectiva reta, duas faces frontais iguais a profundidades Z e 2Z devem ter razão 1 para 0,5 nas dimensões projetadas. Essa validação deve medir uma face de referência, não exigir que toda silhueta arbitrária conserve forma 2D.

Lentes amplas e vistas periféricas podem produzir projeção forte sem alterar as medidas físicas. Resolver problemas reais de clipping, matriz, escala e movimento; nunca esconder inconsistências com uma câmera diferente só para a caixa. Disponibilizar enquadramento e restauração confiáveis para sair de estados extremos.

## 7 Lente e zoom independentes

**Lente:** 10 a 300 mm. Altera campo de visão e relação perspectiva. Não alterar o campo sceneZoom ao editar milímetros.

**Zoom da cena:** 25 a 300%. Amplia a projeção dentro das dimensões existentes do documento, sem mudar lente ou tamanho do PSD. Deve ser aplicado de modo comum à grade, PFs e modelos; não ao documento do artista inteiro.

**Distância:** posição da câmera em unidades da maquete. Pode ser editada diretamente. Não tratá-la como nome alternativo do zoom.

Ao trocar lente ou distorção, medir o tamanho aparente do modelo selecionado antes da mudança e ajustar somente a distância para manter aproximadamente sua maior extensão normalizada. Manter orientação, pan, zoom e escala física. Usar amostras das arestas e uma busca limitada; o mesmo modelo pode servir de âncora quando estiver oculto.

Não forçar largura e altura simultaneamente nem redimensionar vértices. Se a correspondência exigir atravessar o modelo ou exceder os limites, respeitar segurança, aplicar o resultado possível e informar a limitação. Afastamento decorrente de uma lente longa é compensado pela óptica; o objeto não deve simplesmente sumir do quadro ao trocar 35 por 300 mm.

Zoom e pan nativos do Photoshop são independentes desses três parâmetros. Aumentar o zoom de visualização do host não gera nova câmera, novo estado persistido ou novas camadas. As referências já escritas acompanham naturalmente a visualização do documento.

## 8 Olho de peixe

Preservar rotação e deslocamento do modo. Grade e modelos usam a mesma função radial, o mesmo centro e a mesma distância focal. Curvas não podem ser apenas uma decoração sobre um modelo projetado por perspectiva reta.

Função de referência do protótipo:

```text
theta = angulo entre o raio e a direcao frontal
u = sin(theta)
t = distortion / 100
r = f * (u + 0.5 * (1 - t) * u^3 * (1 - u^2))
```

Essa é uma distorção artística normalizada. A 100% usa base de olho de peixe ortográfica, diferente do modo Ortográfica de linhas paralelas. A 0% ainda é curvilínea. Não prometer uma lente comercial calibrada.

Subdividir arestas e superfícies para que a curvatura não vire segmentos grosseiros. A referência atual usa 192 intervalos por guia e subdivisões nos volumes; permitir qualidade adaptativa ao tamanho final, sem alterar a matemática. Recortar a semiesfera frontal, tratar polos e origem central, impedir NaN e não enviar vértices atrás da câmera para um ponto arbitrário no centro da tela.

## 9 Modelos rígidos e escala

Oferecer Caixa, Mesa e Quarto. Mostrar/ocultar não apaga posições ou muda câmera. Uma escala uniforme entre 0,5 e 2,5 afeta todas as dimensões proporcionalmente. O cubo base mede 2 unidades em cada eixo; escala 1,5 resulta em 3 por 3 por 3, em qualquer posição.

Mesa: tampo, quatro pernas proporcionais e dois objetos simples sobre o tampo, como livro e copo. Quarto: piso, duas paredes abertas, cama, mesa e assento. Garantir encaixe entre pernas/tampo e apoio dos móveis no piso. Nenhuma peça pode ganhar escala diferente por causa da câmera ou herdar transformação duplicada.

Cada tipo guarda sua posição XYZ independente. O quarto é movido como conjunto. Selecionar móveis individuais, importar modelos externos, rotacionar objetos independentemente da grade e iluminação avançada ficam fora do escopo inicial. Não implementar esses extras antes de estabilizar as referências básicas.

Usar oclusão correta por depth buffer, clipping e transparência somente onde intencionada. Sombras sofisticadas não são necessárias; faces levemente diferenciadas e contorno legível bastam. Renderizar modelo e guias em camadas separadas para que o usuário controle sua visibilidade.

## 10 Movimento e profundidade

### 10.1 Movimento livre do modelo

Shift e arrasto, ou o modo explícito Mover modelo, traduz somente o modelo num plano paralelo à câmera. Inverter a projeção para converter delta em pixels em deslocamento mundial. Manter a profundidade da origem, lente, zoom, grade e câmera. No olho de peixe, inverter a função radial numericamente.

No limite XYZ, reduzir a translação inteira por um fator comum. Limitar cada coordenada isoladamente pode alterar profundidade e direção; não usar esse procedimento. O gesto não muda a escala.

### 10.2 Movimento seguindo um PF

Ctrl e Shift, ou modo Profundidade com PF selecionado, move num único eixo do mundo. Projetar a linha que passa pela origem do modelo e segue esse eixo; em olho de peixe ela pode ser curva. Encontrar a posição da trajetória mais próxima do alvo do gesto.

Fixar a escolha do eixo até soltar. Movimentar em direção ao PF deve aprofundar no sentido correspondente, com diminuição física quando aplicável; o sentido oposto aproxima. Não escolher o eixo por um rótulo que mudou de índice após uma rotação.

Se a trajetória colapsar num ponto porque o eixo é visto de frente, usar arrasto vertical com sensibilidade limitada para aproximar/afastar. Essa exceção deve funcionar no 1PF central e no centro do olho de peixe.

Uma guia temporária pode mostrar a trajetória no documento durante um modo de ajuste validado. Não escrevê-la a cada hover se isso poluir histórico ou travar pintura. Sem atualização interativa homologada, mostrar o eixo escolhido no painel e aplicar o resultado ao concluir. Nunca exportar essa guia temporária.

### 10.3 Cancelamento e proteção

Capturar o estado inicial e o documento alvo no início do gesto. Esc, perda de foco, pointercancel, fechamento do painel ou mudança de documento cancelam a operação pendente e liberam captura. Os modificadores são definidos no início; mudar teclas no meio não pode trocar de modo abruptamente.

Considerar o volume completo, não só sua origem. Referência de segurança: plano próximo de 0,12 e margem max(0,25; escala vezes 0,5), em unidades da maquete. Ao mover em profundidade, limitar posição para não atravessar a câmera. Ao mudar orientação, tamanho ou distância, afastar a câmera apenas quando necessário para manter o volume à frente.

## 11 Grade e aparência das linhas

Três famílias independentes, X, Z e Y; 1 a 64 guias por família. Contagens inteiras e persistidas. Raios de fuga distribui guias no intervalo visível; Malha espacial representa linhas de uma malha aberta. Não fechar a grade em paredes de uma sala: isso pertence somente ao diorama opcional.

Todas as guias usam a mesma largura e opacidade. Sem linhas principais mais grossas, variações por distância ou reforço arbitrário de eixos. Horizonte usa a mesma espessura, com cor própria e tracejado. Cores por direção são opcionais: X vermelho suave, Y verde e Z azul.

Espessura deve ser medida em pixels do documento Photoshop, não pixels da tela. Valor inicial proposto de 1,5 px, intervalo inicial 0,5 a 4 px, ampliável para documentos grandes mediante teste. Ao migrar a aparência do navegador, converter a base de 1600 px explicitamente, não alterar a espessura a cada zoom do host.

Opacidade de 10 a 100%. Evitar aplicar opacidade duas vezes, nos pixels e na camada. Definir um único lugar responsável e usar o mesmo resultado na exportação. Tratar antialiasing consistentemente; cruzamentos de linhas ainda podem parecer mais intensos.

Eliminar duplicatas geométricas para não engrossar uma guia coincidente. Eixo ortográfico visto de ponta não gera linha. O total visível pode ser menor que a soma dos controles e deve refletir isso. Rótulos e setas ficam dentro do documento, com margem, sem se sobrepor.

Perfis: Limpa mantém horizonte e PFs; Anotada acrescenta cores por direção; Só linhas oculta horizonte e rótulos. Não modificar contagens, cores personalizadas, câmera, modelo, referência ou dimensões do documento ao escolher um perfil.

## 12 Camadas e proteção do documento

Criar ou vincular uma única instância ativa do grupo por documento. Múltiplos estudos de perspectiva independentes ficam para uma evolução posterior. Não criar novo grupo a cada ajuste.

```text
Perspective Grid
  Modelo de referencia
  Marcacoes
  Guias
  Auxilio temporario somente quando necessario
Camadas de pintura do artista
```

Manter IDs e um identificador próprio da instância; nomes podem ser alterados pelo artista. Não assumir que um grupo chamado Perspective Grid pertence ao plugin. Preservar seleção de camadas, ferramenta, seleções de pixels, canais e foco quando uma operação precisar alterá-los. Preferir operações dirigidas por ID que não alterem esses estados.

As camadas de referência devem ser protegidas contra pintura acidental. O plugin pode desbloqueá-las temporariamente apenas para atualizar seu próprio conteúdo e deve restaurar a proteção em finally. Não esconder erros de permissão ou escrever em outra camada como alternativa silenciosa.

Mostrar grade controla Guias e Marcações, não a visibilidade do modelo. A visibilidade geral do grupo oculta tudo. Uma família desligada deve ser removida de verdade na próxima aplicação, sem pixels antigos. O modelo não pode deixar rastros ao mudar de posição.

Não mover ou redimensionar as camadas do plugin com a ferramenta Transformar para simular câmera. Detectar transformações manuais que invalidem o registro e oferecer reconstrução explícita. Se o usuário excluir o grupo, interromper atualizações e pedir para criar ou vincular uma instância; não recriar silenciosamente.

Usar largura/altura reais, origem e coordenadas do documento. RGB 8 bits em documento simples é o alvo inicial. Outros modos, 16/32 bits e artboards precisam de provas separadas; avisar quando não suportados, sem converter a pintura. Não reduzir a resolução do PSD para acelerar o plugin.

## 13 Arquitetura recomendada

Separar núcleo geométrico, estado, interface, renderização e adaptador Photoshop. A rota recomendada para reaproveitar a referência Three.js é um plugin UXP com uma WebView local para controles/renderização e uma ponte para o host. Isso não é um UXP Hybrid Plugin nativo: não exige código C++ ou um serviço externo por definição.

A Adobe documenta HTML local em WebView a partir de UXP 8, ponte local de mensagens e a restrição de localStorage nesse contexto. Mensagens passam por serialização JSON; não assumir transferência binária zero copy. Fonte: [HTMLWebViewElement](https://developer.adobe.com/photoshop/uxp/2022/uxp/reference-js/Global%20Members/HTML%20Elements/HTMLWebViewElement/).

Como alvo técnico inicial, propor Photoshop 26.1 ou superior: o changelog associa Photoshop 26.0 ao UXP 8.0.1 e 26.1 ao UXP 8.1, que acrescenta ResizeObserver. Isso é critério de desenvolvimento, não homologação automática. Se o projeto atual usa versão mínima superior, não reduzi-la. Fonte: [Changelog Photoshop e UXP](https://developer.adobe.com/photoshop/uxp/ps_reference/changelog/).

Antes de adotar essa rota, fazer uma prova dentro da versão instalada: carregar a WebView local, criar contexto WebGL2, desenhar um cubo, ler pixels, enviar um buffer pequeno e atualizar uma camada. Suporte de HTML local não prova suporte de WebGL2, desempenho ou comportamento com painel oculto. Medir Windows e macOS separadamente se ambos forem declarados compatíveis.

Se a implementação existente já tem renderer compatível e testado, preservá-lo. Se WebGL2 na WebView não funcionar, apresentar a limitação e avaliar outro backend consolidado; não fingir equivalência com uma caixa 2D ou remover modelos silenciosamente. Uma variante somente de grade deve ser identificada como escopo reduzido.

### 13.1 Responsabilidades

- Núcleo puro: estado validado, câmera, linhas, PFs, projeção, trajetórias e exportação vetorial. Sem acesso ao Photoshop.
- Interface: controles, gestos e intenções de alteração. Sem acesso irrestrito a batchPlay.
- Renderer: imagens transparentes de Guias, Marcações e Modelo, com mesma revisão/câmera e teste de pixels.
- Adaptador UXP: documentos, camadas, modal, histórico, arquivos e persistência.
- Coordenador: versões, cancelamento, estados pendentes, fila de escrita e confirmação de aplicação.

A WebView não deve virar outro canvas de composição. Renderizar os modelos em um alvo técnico e transferir o resultado ao documento. O cubo pequeno é o único controle 3D necessariamente visível no painel. Todos os scripts, fontes e ícones essenciais são locais, sem CDN, servidor, login ou conexão obrigatória.

## 14 Protocolo e aplicação no host

Definir um protocolo próprio versionado com tipos permitidos, como READY, CAPABILITIES, DOCUMENT_CONTEXT, STATE_CHANGED, RENDER_REQUEST, RENDER_RESULT, APPLY_ACK, CANCEL e ERROR. Esses nomes são contratos internos, não APIs da Adobe.

Toda mensagem relevante leva requestId, revision, documentSessionId, documentId, dimensões, tipo de camada e versão do protocolo. O host é a autoridade para destino e estado aplicado. Validar origem, emissor, esquema, números finitos, comprimento, dimensões e limites de memória; não aceitar JavaScript, caminhos livres ou comandos batchPlay arbitrários vindos de mensagem.

Para pixels, transportar uma representação JSON segura, como RGBA em base64 dividido em blocos com tamanho limitado, sequência e checksum. Esse é um desenho proposto: medir overhead antes de definir tamanho dos blocos. Descartar reconstruções incompletas, expiradas ou de revisão antiga. Confirmar ordem das linhas, RGBA, alpha e conversão de origem inferior do WebGL para superior do documento.

Uma única revisão deve corresponder às três camadas. Não combinar grade nova com modelo antigo. Reutilizar os pixels de grade quando somente o modelo se move, mas registrar de forma consistente o estado aplicado do conjunto.

A Imaging API permite criar PhotoshopImageData de um buffer e gravá-lo com putPixels numa camada de pixels. Usar IDs explícitos, replace para retirar conteúdo anterior e targetBounds com left/top; largura e altura pertencem ao buffer. Liberar imageData em finally. Fonte: [Imaging API](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging).

Fluxo de escrita proposto:

1. Capturar snapshot validado, documento alvo e revisão.
2. Preparar geometria e buffers fora da operação modal.
3. Verificar novamente documento, dimensões, instância e revisão.
4. Entrar no escopo modal e validar mais uma vez antes de escrever.
5. Atualizar somente camadas próprias, mantendo estado do artista.
6. Confirmar histórico, emitir APPLY_ACK e persistir o estado aplicado.
7. Em falha, cancelar a transação, liberar buffers e não marcar como sincronizado.

Não usar o documento ativo como destino implícito depois de um await. Se houve troca de documento, a política padrão é descartar o resultado antigo, não aplicá-lo ao novo documento nem a um documento fechado.

## 15 Atualização histórico e desempenho

Oferecer Ao soltar e Durante arrasto. Ao soltar é o padrão de segurança inicial: os controles respondem enquanto o usuário ajusta e a escrita final ocorre ao concluir. Durante arrasto só é habilitado após teste real de latência, histórico e cancelamento; não anunciar tempo real se apenas aplica no final.

Durante arrasto, manter no máximo uma escrita em andamento e somente a intenção mais recente pendente. Descartar quadros antigos, reduzir qualidade de preview apenas de forma explícita e aplicar a qualidade final ao soltar. Ao soltar não pode perder o último evento por causa do debounce.

Modificar o host dentro de executeAsModal, tratando colisões, cancelamento e exceções. Usar os mecanismos de histórico para obter uma ação de desfazer por gesto confirmado quando validado. Não manter uma operação modal aberta permanentemente nem supor que várias transações se agrupam automaticamente. Fonte: [Execução modal e histórico](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal).

Manter estado de edição pendente separado do estado aplicado. Cancelar descarta alterações pendentes; se previews já foram gravados, restaurar explicitamente o snapshot anterior dentro de uma transação segura. Nunca usar um desfazer global cego que possa remover a última pincelada do usuário.

Medir geometria, renderização, transferência, espera modal e gravação separadamente. Um RGBA 6000 por 4000 de 8 bits ocupa 96 MB antes de cópias; base64, JSON e GPU acrescentam custo. Liberar por camada e evitar múltiplos buffers completos simultâneos. Não oferecer uma meta de fps como garantia antes de medir.

Trabalhar no menor retângulo útil quando isso não deixar rastros. Otimização por tiles precisa de política de substituição e limpeza; não combinar replace true para cada tile com a expectativa de preservar os anteriores. Qualidade reduzida não pode ser escrita em escala incorreta: rasterizar nas coordenadas finais ou definir uma transformação validada.

Ocultar/fechar o painel interrompe trabalho pendente e libera recursos apropriados. Reabrir recarrega o estado aplicado. Se a WebView ou GPU falhar, a arte permanece intacta, o painel informa o erro e oferece tentar novamente.

## 16 Estado e persistência

Não usar localStorage da WebView como fonte principal. Manter estado no lado UXP, persistido no armazenamento de dados do plugin; salvar/exportar um projeto JSON pelo seletor do host. A referência da Adobe descreve os provedores de arquivos e tokens persistentes, cuja recuperação deve tratar permissões perdidas. Fonte: [Armazenamento UXP](https://developer.adobe.com/photoshop/uxp/2022/uxp/reference-js/Modules/uxp/Persistent%20File%20Storage/FileSystemProvider/).

Separar preferências globais, presets do usuário, estado de edição e estado aplicado por documento. IDs de sessão do Photoshop não devem ser tratados como identificadores permanentes após reabrir um PSD. Definir UUID de instância e mecanismo de associação validado, por metadados próprios ou arquivo de projeto. Não gravar metadados no PSD nem salvar o documento automaticamente sem uma operação clara do usuário.

JSON de projeto deve conter schemaVersion, versão de geometria, câmera, grade, modelos, dimensões de referência, unidades e identificador da instância. Não depender de IDs antigos de camada ao importar para outro documento; resolver ou criar vínculos explicitamente.

Estado conceitual, não código de API:

```text
schemaVersion
geometryVersion
instanceId
documentSession
  documentId width height colorMode bitDepth
camera
  mode yaw pitch roll focalLengthMm distance
  sceneZoom panXPercent panYPercent distortion
grid
  construction visible xEnabled yEnabled zEnabled
  xCount yCount zCount lineWidthPx opacity color
  horizonVisible horizonColor vanishingPointsVisible
  axisColorsEnabled
models
  activeModel visible uniformScale
  boxPosition tablePosition roomPosition
interaction
  mode selectedAxis selectedDirection
hostBinding
  groupId guidesLayerId marksLayerId modelLayerId
runtime
  pendingRevision appliedRevision updatePolicy
```

Validar versões e campos antes de importar. Ausentes recebem defaults; inválidos não geram NaN. Migrações devem ser explícitas, testadas e reversíveis, com backup. Não copiar a política de reinicialização do navegador para um projeto UXP já em uso e apagar estados do usuário silenciosamente.

## 17 Valores iniciais e comandos

Defaults de referência para nova cena, ajustáveis após teste no host:

| Parâmetro | Valor inicial | Limite inicial |
| --- | --- | --- |
| Modo | Livre | 1PF, 2PF, 3PF, peixe, livre, ortográfica |
| Yaw e pitch | 43 e 5 graus | Conforme modo |
| Roll | 0 grau | Bloqueado nos modos fixos |
| Lente | 35 mm | 10 a 300 mm |
| Distância | 16 unidades | 4 a 500 e proteção do volume |
| Zoom da cena | 100% | 25 a 300% |
| Pan horizontal e vertical | 0% | -100% a 100% |
| Distorção | 100% | 0 a 100% no peixe |
| Modelo | Caixa visível | Caixa, Mesa, Quarto |
| Escala uniforme | 1,5 | 0,5 a 2,5 |
| Posições dos modelos | 0, 0, 0 | -100 a 100 por eixo |
| Guias X e Z | 16 e 16 | 1 a 64 cada |
| Guias Y | 12 | 1 a 64 |
| Opacidade | 80% | 10 a 100% |
| Espessura | 1,5 px | 0,5 a 4 px, em pixels do documento |
| Atualização | Ao soltar | Interativa após homologação |

Ativar Olho de peixe pela primeira vez usa vista frontal, lente de 10 mm e distorção 100%. Não aplicar uma troca automática de modo por causa de um valor numérico. Definir política de recordar parâmetros por modo sem misturar projection antigo com preset novo.

**Centralizar posição:** zera somente posição do modelo ativo. **Enquadrar modelo:** ajusta distância/pan para caber com cerca de 10% de margem, mantendo lente, zoom, escala e posição mundial. **100%:** muda apenas sceneZoom. **Restaurar cena:** recupera câmera, zoom, escala e posições no modo atual; preserva grade, referência, modelo escolhido e documento. Nunca remove pintura ou cria novo documento.

## 18 Referências e exportação

O documento Photoshop já é a imagem de trabalho. Não capturar e reaplicar sua composição a cada ajuste nem gerar feedback lendo as próprias camadas do plugin como referência.

Importar referência é opcional: seletor de arquivo do host e inserção em camada separada, com autorização explícita e sem substituir a arte. PNG/JPEG/WebP conforme suporte validado. Não presumir input file ou drag and drop do navegador no DOM UXP. Remover referência afeta somente a referência importada pelo plugin.

Exportar grade em PNG transparente e SVG. Conteúdo padrão: guias, horizonte e PFs habilitados. Excluir modelo, imagem de referência, pintura, fundo e auxílio temporário. Exportar modelo pode ser uma opção separada futura, desligada por padrão, não uma mudança do significado de Exportar grade.

No Photoshop, dimensão padrão de exportação é a do documento. Oferecer opcionalmente largura personalizada, incluindo 2400 px, mantendo proporção e uma política explícita de escala de traços. Não redimensionar o PSD. PNG com alpha real; SVG em coordenadas válidas, sem imagem da pintura embutida nem recursos externos.

Salvar JSON permite transportar a cena paramétrica. Botão Exportar abre o seletor de destino, não simula download com link HTML no host. Cancelar o seletor não cria erro nem arquivo vazio. Tratar arquivos existentes e permissões sem sobrescrita silenciosa.

## 19 Manifest instalação e empacotamento

Manter o formato de plugin UXP do projeto atual. Usar manifest version 5, host Photoshop e API version 2 conforme a estrutura suportada pela versão alvo. Manter ID estável para atualizações do mesmo canal. Definir entrypoint de painel, main existente, tamanho mínimo/preferido, nome e ícones reais. Validar o manifest no UXP Developer Tool em vez de entregar pseudoconfiguração como arquivo pronto.

Permissões mínimas: acesso de arquivos por escolha do usuário, sem fullAccess; WebView local com ponte somente local quando essa arquitetura for adotada; sem domínios externos ou rede se não forem necessários. A referência de manifest descreve localFileSystem request e os limites de permissões. Fonte: [Manifest v5](https://developer.adobe.com/photoshop/uxp/2022/guides/uxp-guide/uxp-misc/manifest-v5/).

Na configuração compatível com UXP 8, consultar allowLocalRendering e enableMessageBridge localOnly, com lista de domínios vazia para conteúdo local. Em versões mais novas houve mudanças de campos; usar documentação e validação da versão mínima declarada, não remover campos só porque foram descontinuados numa versão posterior. A IA deve listar quais campos foram realmente testados.

Estrutura sugerida, adaptável à organização existente:

```text
manifest.json
host.html
host/
  entrypoints.js document-adapter.js layer-manager.js
  apply-queue.js history.js persistence.js files.js
shared/
  state-schema.js camera.js projection.js guides.js
  model-geometry.js interactions.js protocol.js
panel/
  index.html styles.css controls.js bridge.js
  renderer.js assets/ vendor/
tests/
  geometry/ protocol/ renderer/ host/ fixtures/
docs/
  instalacao.md uso.md compatibilidade.md testes.md
licenses/
```

Para desenvolvimento, documentar como habilitar o ambiente, adicionar o manifest no UDT, carregar, depurar e recarregar no Photoshop. Para distribuição, gerar o .ccx pelo comando Package do UDT, sem simplesmente renomear um ZIP. ID e host devem ser conferidos antes de empacotar. Fonte: [Empacotar plugin UXP](https://developer.adobe.com/uxp/guides/how-to/distribution/package/).

Para instalar o pacote, fornecer instrução de abertura do .ccx pelo Creative Cloud Desktop, localização no menu Plugins do Photoshop e como atualizar sem perder dados. Distinguir esse fluxo do carregamento de desenvolvimento. Fonte: [Instalar plugin UXP](https://developer.adobe.com/uxp/guides/how-to/distribution/install/).

Não gerar .zxp, extensão CEP, servidor local obrigatório, instalador nativo ou UXP Hybrid com binário sem uma necessidade e autorização específicas. Se o ambiente da IA não tiver UDT/Photoshop, entregar o projeto pronto para empacotamento e declarar que o .ccx e os testes no host estão pendentes.

## 20 Estados de erro e recuperação

Sem documento: painel abre normalmente, permite ajuda/presets, mas desabilita aplicar/exportar nas dimensões do host. Não criar documento sem pedido. Documento incompatível: informar modo/profundidade não suportados e preservar arte.

Host ocupado: manter último estado pendente, permitir cancelar e evitar loop infinito de tentativas. Camada removida: interromper aplicação, manter parâmetros e oferecer recriar/vincular. Documento fechado/trocado: invalidar buffers e não aplicar num destino novo.

Renderer indisponível: informar erro, preservar camadas já aplicadas e oferecer reinicialização. Persistência inacessível: sessão pode continuar, mas avisar que alterações não serão recuperadas automaticamente. JSON inválido: rejeitar sem substituir a cena atual.

Limite de memória ou resolução: interromper antes de alocar além do orçamento; oferecer política de qualidade explicitamente, sem reduzir o documento. Falha entre camadas: restaurar a revisão anterior ou manter estado de erro recuperável, nunca confirmar sucesso parcial.

Mensagens devem ser curtas e acionáveis. Logs técnicos ficam num diagnóstico copiável, sem pixels da arte, conteúdo de arquivos pessoais ou caminhos sensíveis desnecessários.

## 21 Testes de aceitação obrigatórios

### 21.1 Geometria e modelos

- Medir cubo em várias posições e profundidades: três dimensões mundiais iguais e escala uniforme.
- Dobrar profundidade de face frontal reduz largura/altura projetadas pela metade na perspectiva reta.
- Arestas e guias da mesma família convergem ao mesmo PF com erro numérico definido.
- Rotacionar e mover mantém modo; 2PF nunca ganha convergência vertical; 3PF muda lado vertical sem trocar para Livre.
- Olho de peixe gira, desloca, curva grade/modelo e aceita profundidade pelo PF central.
- Limites XYZ não alteram a profundidade do movimento lateral; aproximação nunca atravessa o volume.
- Lentes 10, 35 e 300 mm, zoom 25, 100 e 300%, ângulos próximos de 0/90/180 graus, modelos nos limites e todos os formatos de documento.
- Conferir mesa e quarto peça por peça: proporções constantes, oclusão correta e ausência de objetos alongados por transformação duplicada.

### 21.2 Interação e aparência

- Scroll no controle da cena muda zoom, não mm; scroll no painel continua permitindo rolagem.
- Troca de lente preserva aproximadamente enquadramento do modelo sem mudar sceneZoom ou escala da malha.
- Shift não altera grade; profundidade muda só um eixo mundial; PF permanece selecionado até soltar.
- Esc, blur, troca de aba, fechamento de painel, resize e pointercancel não deixam gestos presos nem aplicam mudanças atrasadas.
- Restaurar cena e Enquadrar recuperam estados extremos com resultados diferentes e coerentes.
- Contagens 1, 7, 32 e 64 por eixo; famílias ocultas, linhas coincidentes, horizonte/PFs nas bordas e espessura uniforme.
- Inspecionar screenshots e pixels reais; não aceitar canvas vazio, rótulos sobrepostos, faces faltantes ou modelo fora do quadro no estado inicial.
- Painéis de 280/320/480 px, alturas curtas, temas claros/escuros e escalas de tela diferentes.

### 21.3 Photoshop e integridade

- Aplicar no documento A, trocar para B durante renderização e confirmar que B não foi tocado.
- Fechar, redimensionar ou mudar modo de cor durante trabalho pendente invalida a revisão correta.
- Desenhar antes e depois do ajuste mantém a pintura, a camada selecionada e os atalhos do Photoshop.
- Remover/renomear grupo, bloquear camada, desfazer/refazer e reabrir PSD não criam duplicatas nem vínculos falsos.
- Repetir gestos não acumula camadas, pixels velhos, recursos GPU ou memória.
- Cancelar depois de uma prévia não desfaz uma pincelada alheia.
- PNG/SVG têm alpha/linhas esperados e não vazam pintura/modelos. JSON exportado e importado reproduz a cena nas mesmas dimensões.
- Instalar .ccx limpo, atualizar pacote, reiniciar Photoshop e verificar recuperação. Testar offline e registrar versões exatas de host, SO e GPU.

Registrar testes em executado e aprovado, executado e falhou, ou não executado. Informar tolerâncias, parâmetros e imagens dos casos visuais. Conservar as regressões do protótipo, mas acrescentar testes do host; números de testes do navegador não são critério de homologação do plugin.

## 22 Ordem de implementação e entregáveis

**Etapa 1:** auditar UXP existente, criar prova de capacidade e demonstrar uma grade simples numa camada do documento correto. Não começar por uma interface nova completa sem essa prova.

**Etapa 2:** integrar câmera única, caixa rígida, modos 1/2/3/livre/ortográfica, zoom/lente independentes e aplicar ao soltar. Demonstrar diminuição e convergência com testes visuais.

**Etapa 3:** adicionar mesa, quarto, olho de peixe, Shift, profundidade por PF e limites/cancelamento. Testar o volume inteiro e a projeção curva.

**Etapa 4:** concluir controles da grade, layout responsivo de painel, persistência, importação/exportação, recuperação e histórico.

**Etapa 5:** medir atualização durante arrasto, homologar versões/plataformas, empacotar .ccx e testar instalação/atualização. Captura direta sobre o canvas Photoshop só entra se demonstrada; não é condição para o fallback funcional do painel.

Entregar código organizado, dependências locais e licenças, manifest validado, instruções de desenvolvimento/instalação, pacote quando efetivamente gerado, manual de uso, matriz de compatibilidade, testes reproduzíveis e lista honesta de pendências. Não marcar recursos como concluídos só porque existe um botão.

Ao concluir cada etapa, mostrar o fluxo funcionando no Photoshop: parâmetro no painel, camada correta atualizada e pintura preservada. Toda escolha técnica deve servir à experiência de desenhar no documento real, com referências coerentes e recuperáveis.

## 23 Fontes e política de validação

As referências oficiais estão vinculadas nas seções correspondentes e foram consultadas em 30 de setembro de 2026. Elas comprovam APIs documentadas, não a compatibilidade automática desta combinação de renderer, painel e host. Conferir novamente a documentação da versão usada no desenvolvimento.

Esta entrega é um documento de implementação. Não instala nem altera o plugin UXP e não substitui homologação dentro do Photoshop. Não considerar especificações antigas de câmera local ou restauração experimental como parte do produto.
