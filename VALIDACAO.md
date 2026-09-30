# Verificação do protótipo — 30/09/2026

## Revisão 12: restauração da base e regressões

Validação em Windows, Edge headless com Playwright, abrindo arquivo local sem servidor. Renderer recompilado. Sem histórico Git versionado para restaurar um commit exato, foram removidos os experimentos e preservada uma cópia dos arquivos anteriores em `C:\Users\rafi_\AppData\Local\Temp\perspective-grid-before-stabilization-20260930-095319`.

### Correções verificadas

- Removidos Enquadramento natural e adaptador residual de câmera local. Modelos e grade recebem diretamente a mesma câmera.
- Estado v3 começa com câmera/posições limpas. Migra opções da grade e mantém v2 intacto. JSON malformado, tipos inválidos e armazenamento bloqueado não impedem uso.
- Proteção do volume inteiro em mudanças de câmera, escala e distância, não somente sua origem.
- Shift mantém profundidade no limite XYZ; Ctrl + Shift funciona também no PF central frontal do olho de peixe.
- Escolha do PF usa o clique atual, não uma posição antiga do cursor.
- Esc, blur, pointercancel e resize restauram o início do gesto e permitem novo arrasto.
- Restaurar cena recupera zoom, escala e todas as posições. Enquadrar modelo centraliza limites projetados sem mover a posição 3D.
- Perda/restauração real do contexto WebGL pela extensão de teste: aviso, grade preservada e modelo redesenhado após recuperação.

### Resultados

- `npm test`: 39 testes de geometria aprovados.
- `npm run test:browser`: lente, zoom, cinco modos, três modelos, Ctrl + Shift nos eixos, Shift no canvas/cubo, persistência e download SVG aprovados, sem erros de console.
- `npm run test:stability`: 108 combinações raster (6 modos × 3 modelos × 3 lentes × 2 zooms). Limites dos pixels comparados à geometria: erro máximo 1,535 px em 640 × 400, abaixo da tolerância de 3 px para amostragem/antialiasing. Todos renderizaram pixels; medidas de cada peça permaneceram constantes após translação/enquadramento.
- 270 configurações de segurança (6 modos × 3 modelos × 5 yaw × 3 pitch), mais deslocamentos extremos em X/Y/Z. Profundidade mínima 1,37 unidade, acima do recorte de 0,12; cubo de escala 2,5 mediu exatamente 5 × 5 × 5.
- Câmeras nativas Three.js e geometria da grade concordaram com erro máximo inferior a 3e-12 px nos casos de interação. Nenhuma câmera local do modelo.
- PNG real: 2400 × 1500, 3.382.393 pixels transparentes e 217.607 com traço no estado testado. Importação/remoção de referência aprovadas.
- Capturas em 1920 × 1080, 1024 × 768, 375 × 812 e 320 × 740; sem transbordamento horizontal. Conferência com DPR 2.
- Folha de 12 vistas da caixa/mesa/quarto, desktop e celular inspecionados. Capturas `perspective-audit-models.png` e `perspective-v12-*.png` na pasta temporária.

### Limites da conclusão

A captura enviada não contém os parâmetros salvos exatos; não foi possível atribuir cada pixel do alongamento antigo a uma causa única. Foram confirmadas falhas de recuperação, estados extremos e segurança geométrica, removidas as compensações rejeitadas e adicionados testes de pixels/medidas. A câmera reta continua apresentando perspectiva em lentes abertas e vistas periféricas; a malha não recebe correções artificiais.

Essa cobertura não prova ausência absoluta de bugs nem substitui teste em todos os dispositivos/GPU. Não foram testadas integração UXP, escrita no canvas Photoshop, gestos do host ou desempenho dentro dele.

## Histórico anterior

Os registros abaixo são de revisões anteriores, inclusive abordagens rejeitadas. Não descrevem recursos vigentes; usar a especificação da revisão 12.

## Versão 11 — restaurar coerência entre caixa e grade

- Removidos checkbox e comportamento da câmera local. `preserveShape` antigo não é carregado. A caixa usa exatamente a câmera global novamente.
- Trinta e cinco testes passaram. O teste da compensação foi substituído por convergência das quatro arestas de profundidade do cubo para o PF global em quatro posições periféricas.
- Playwright confirmou ausência do controle removido e convergência de vértices projetados pela câmera nativa Three.js para o PF calculado da grade. Regressões de Ctrl + Shift por eixo, Shift, lente, zoom, enquadramento, modelos, exportação e persistência passaram sem erros de console.
- A compensação da versão 10 foi rejeitada pelo usuário; não a reintroduzir. A perspectiva reta de grande abertura ainda pode apresentar alongamento periférico. Enquadramento natural muda a câmera global para reduzir esse efeito, sem separar objeto e grade.

## Versão 10 — forma compacta e movimento pelos PFs

- Trinta e cinco testes de geometria passaram. Incluem seleção dos eixos, ordem dos rótulos 1PF/2PF/3PF, deslocamento de uma única coordenada XYZ, reversibilidade, eixo visto de frente, câmera local, âncora do modelo, silhueta compacta em quatro posições periféricas e independência da grade.
- Renderer recompilado com sucesso. Câmeras nativas Three.js comparadas à geometria em 10/35/300 mm, vários modos, pan e zoom: erro máximo inferior a 3e-12 pixels. BoxGeometry medida em 3 × 3 × 3 unidades após escala uniforme de 1,5.
- Edge/Playwright: configuração semelhante à captura do usuário, 10 mm, câmera a 8,5 unidades e caixa deslocada para [-10,4; 19,6; 0]. Preservar forma mudou a silhueta alongada para compacta. Razão altura/largura projetada passou de 1,485 para 1,161. Lente, zoom, pan, distância, coordenadas, escala e SVG da grade permaneceram iguais. Não se preserva o tamanho projetado anterior: a distância real passa a produzir a diminuição na câmera local.
- Checkbox preservado na recarga; estados sem o campo usam true. Capturas antes/depois inspecionadas: `perspective-shape-before.png` e `perspective-shape-after.png` na pasta temporária.
- Ctrl + Shift selecionou eixos de 1/2/3 pontos, olho de peixe oblíquo e Ortográfica por gestos reais. Guia e estado de seleção conferidos; somente a coordenada escolhida mudou. Trajetória, câmera, grade e persistência aprovadas.
- Enquadramento natural testado separadamente sem compensação local: reduziu o ângulo periférico de 69,04° para 26,91°, ajustando a lente para 121 mm e preservando aproximadamente extensão e centro.
- Regressões de modelos, lente, distorção, zoom, Shift, exportação e recarga passaram, sem erros JavaScript/console. Capturas desktop e celular inspecionadas, sem transbordamento horizontal.
- Limitação explícita: com Preservar forma, arestas do modelo podem divergir dos PFs globais; a trajetória da origem segue a grade. Não há integração Photoshop/UXP implementada.

## Versão 08 — profundidade com Ctrl + Shift

- Trinta e um testes de geometria passaram. Casos novos verificam translação ao longo da câmera, câmera/grade/escala invariantes, reversibilidade, limites e redução exata de largura e altura pela metade ao dobrar a profundidade de uma face frontal.
- `app.js` passou na verificação de sintaxe e o renderer Three.js foi recompilado.
- Edge/Playwright: Ctrl + Shift com arrasto para cima no canvas afastou os três modelos; arrasto para baixo no cubo aproximou. A extensão projetada diminuiu ao afastar em perspectiva de um ponto e olho de peixe. Em Ortográfica, o tamanho permaneceu constante. Lente, zoom, orientação, pan, distância da câmera, escala 3D e SVG da grade ficaram iguais.
- Posições em profundidade persistiram após recarga. Regressões de Shift lateral, restauração, ocultar modelo, lentes, zoom e exportação passaram, sem erros JavaScript ou de console.
- Capturas v08 de desktop e celular inspecionadas; modelos renderizados e sem transbordamento horizontal. A aparência periférica da projeção reta não recebeu uma compensação local que desalinhe o modelo da grade.
- Nenhuma integração Photoshop/UXP executada.

## Versão 07 — Shift move somente o modelo

- Vinte e oito testes de geometria passaram. Novos casos cobrem translação em plano paralelo à câmera nos seis modos e em três valores de zoom, ida/volta do gesto, grade e câmera invariantes, posições independentes, persistência, sanitização, modelo oculto, limites no olho de peixe e compensação de lente com objeto deslocado.
- Sintaxe de `app.js` e recompilação do renderer Three.js aprovadas.
- Edge/Playwright: Shift + arrastar no canvas e no cubo moveu caixa, mesa e quarto. Os pixels renderizados mudaram, mas SVG da grade, orientação, pan, lente, distância, zoom e distorção permaneceram iguais. As posições dos outros modelos não mudaram.
- Posições preservadas ao recarregar; Restaurar posição zerou somente o modelo selecionado. Modelo oculto não se moveu com Shift e a câmera permaneceu fixa. Mover sem Shift continuou deslocando o enquadramento.
- Regressões de lente 10/35/300 mm, zoom interno, rotação do olho de peixe e download SVG aprovadas. Nenhum erro JavaScript ou de console.
- Capturas inspecionadas em 1440 × 1000 e 375 × 812, com pixels do modelo visíveis e sem transbordamento horizontal. O teste reproduzível está em `verify-browser.cjs`; capturas v07 ficam na pasta temporária.
- Shift move o diorama inteiro, não seus móveis individuais. Integração Photoshop/UXP continua não implementada.

## Versão 06 — zoom interno, enquadramento e olho de peixe livre

- Vinte e quatro testes de geometria passaram, incluindo escala da projeção dentro do documento fixo, compensação de distância nas lentes de 10 a 300 mm, distorção com tamanho preservado, limites da câmera, rotação curvilínea e manutenção dos modos 1/2/3 pontos.
- Sintaxe de `app.js` e recompilação do renderer Three.js aprovadas.
- Edge/Playwright: scroll no canvas e no cubo não mudou lente nem distância. Em cinco modos, o modelo ampliou cerca de 19% com o canvas permanecendo em 1036 × 648 pixels.
- Caixa, mesa e quarto em 3 pontos e olho de peixe: comparadas lentes de 10, 300 e 35 mm com zoom de 120% e orientação fixa. A maior extensão normalizada do modelo permaneceu dentro de 0,018 do quadro; os pixels mudaram com a perspectiva. A distância da câmera foi compensada automaticamente. Distorção também preservou zoom e tamanho aproximado.
- Arrastos reais no olho de peixe confirmaram giro pelo cubo, deslocamento por Mover no canvas e no cubo, e Shift + arrastar sem alterar orientação. Modo e zoom persistiram após recarga.
- Download SVG real correspondeu à geometria do estado atual, incluindo zoom da cena, com polilinhas e sem coordenadas inválidas. Alterar o zoom mudou a exportação no estado curvilíneo testado.
- Capturas de desktop 1440 × 1000 e celular 375 × 812 inspecionadas; modelos renderizados e sem transbordamento horizontal. Nenhuma exceção JavaScript ou erro de console nos testes.
- `verify-browser.cjs` registra a regressão de interação e pixels. Requer Playwright e Edge; execute `node verify-browser.cjs` com Playwright disponível, ou defina `PLAYWRIGHT_MODULE` para o caminho do módulo instalado. Capturas ficam na pasta temporária do sistema.
- A compensação mantém tamanho aparente, não largura e altura simultaneamente. Limites de distância e plano de recorte continuam aplicáveis. Nenhuma integração Photoshop/UXP foi executada.

## Versão 05 — modos fixos, lente e referências 3D

- Dezenove testes de geometria passaram. Incluem manutenção da quantidade de pontos após arrastos, atalhos alinhados aos eixos, verticais paralelas em 2 pontos, migração de campo de visão, razão de ampliação 10/300 mm, projeção curvilínea, cinco pontos e posicionamento das marcações em tela pequena.
- Sintaxe de `app.js` e compilação do pacote Three.js aprovadas.
- Edge/Playwright, abrindo arquivo local: modos 1/2/3/5 mantidos após arrastos reais no cubo e uso de Restaurar. Restrições de pitch/yaw conferidas pelos controles.
- Caixa, mesa e diorama com Three.js/WebGL2: 90.226, 29.866 e 85.145 pixels diferentes do fundo, respectivamente, com a grade desligada nos estados testados. Capturas confirmaram móveis visíveis e oclusão pelo piso/paredes correta.
- Lente de 300 mm preservada após Enquadrar modelo; distância resultante de 159,08 unidades no estado testado. Retornar a 10 mm e reenquadrar reduziu a distância. Sem ajuste automático escondido na troca de lente.
- Alterar distorção de 100% para 20% mudou os pixels da composição; grade e diorama curvaram sob a mesma projeção. Projeção e escolha do diorama persistiram após recarga.
- Download SVG com polilinhas, rótulos de 1PF a 5PF e sem imagem/modelo incorporado ou coordenadas inválidas. Download PNG de 2400 × 1500 px: 3.386.643 pixels transparentes e 213.357 com traço no estado testado antes do ajuste final de posicionamento dos rótulos.
- Capturas inspecionadas em 1440 × 1000 e 375 × 812 px; sem transbordamento horizontal. A composição móvel teve 23.945 pixels diferentes do fundo. Corrigidos rótulos próximos às bordas que eram indevidamente chamados de fora do quadro e colisão de texto entre horizonte e pontos.
- Nenhuma exceção JavaScript ou erro de console nas interações, incluindo compilação dos shaders.
- Documentação e prompt atualizados para a arquitetura de canvas do Photoshop. O renderer WebGL2 do navegador não foi homologado em UXP; nenhuma integração com camadas do Photoshop foi executada.

## Versão 04 — traço, quantidades e caixa central

- Treze testes de geometria passaram. Novos casos cobrem largura/opacidade uniformes nos dois modos, contagens de 1/7/32/64 por família, pontos finitos/distantes/infinitos, projeção ortográfica, migração da densidade antiga e independência do tamanho da caixa.
- Verificação de sintaxe de `app.js` aprovada.
- Edge com Playwright, via arquivo local: 9 guias X + 15 Z + 6 Y resultaram em 30 guias; desativar Y resultou em 24 e desabilitou seu controle de quantidade.
- Caixa: liga/desliga, tamanho, persistência após recarga e preservação ao trocar os três perfis confirmados. O arrasto do cubo alterou os pixels da composição.
- Download SVG do perfil Só linhas: 30 segmentos, todos com 3 px (espessura de 2 px na base de 1600, exportada a 2400), sem caixa, textos, círculos, imagens ou coordenadas inválidas.
- Download PNG: 2400 × 1500 px, 3.434.439 pixels transparentes e 165.561 com traço no estado testado.
- Capturas inspecionadas em 1440 × 960 e 375 × 812 px. Caixa e controles visíveis, sem transbordamento horizontal no celular. O painel desktop permite rolagem dos ajustes e mantém caixa e exportação acessíveis.
- Nenhuma exceção JavaScript capturada nas interações.
- `FUNCIONAMENTO-DO-PLUGIN.md` documenta a experiência no canvas do Photoshop, proposta UXP, camadas, coordenadas, histórico, cancelamento e validações pendentes. Integração no Photoshop não executada.

## Versão 03 — perfis rápidos

- Nove testes de geometria passaram; `app.js` passou na verificação de sintaxe do Node.
- Interface testada no Edge com Playwright, abrindo `index.html` diretamente, sem servidor.
- Perfis Limpa, Anotada e Só linhas aplicaram as opções esperadas, preservando rotação e opacidade personalizadas. O destaque acompanhou ajustes individuais e foi recuperado após recarregar.
- Arrasto real no cubo alterou a rotação e os pixels da grade.
- Downloads reais confirmados: SVG de Só linhas sem textos, círculos, fundo ou imagem; PNG de 2400 × 1500 px com 3.425.295 pixels transparentes e 174.705 pixels desenhados no estado testado.
- Capturas inspecionadas em 1440 × 960 e 375 × 812 px. Sem transbordamento horizontal no celular ou texto cortado nos botões dos perfis.
- Nenhuma exceção JavaScript capturada durante essas interações.

## Versão 02 — malha aberta

- Nove testes de geometria passaram. Além dos casos anteriores, verificam que as guias chegam às bordas da composição e que cada família converge exatamente ao seu ponto de fuga, tanto na malha espacial quanto no modo de raios.
- Verificados ângulos entre -180 e 180 graus, incluindo vistas verticais exatas, sem coordenadas infinitas ou valores inválidos.
- Horizonte com cor independente e rótulos 1PF, 2PF, 3PF presentes no SVG, com a indicação de pontos fora do quadro. Desabilitar as marcações remove os rótulos da exportação.
- Cubo de referência oculto por padrão; cubo do painel preservado. Malha espacial sem faces, paredes ou contorno de sala.

## Primeira versão — histórico da verificação

- Sete testes de geometria passaram: rotação e deslocamento conjunto, convergência dos pontos de fuga, recorte perto da câmera, posições iniciais de 1/2/3 pontos, paralelismo ortográfico, correspondência do SVG e sanitização dos valores salvos.
- Arrasto real no cubo: a câmera mudou de 34°/17° para 73°/26,75°; o cubo da composição e os planos acompanharam visualmente a orientação.
- Controles de planos, opacidade, enquadramento e vista superior responderam na interface. O campo de visão ficou desabilitado no modo ortográfico.
- Parâmetros foram preservados ao recarregar a página.
- Imagem de referência carregada e removida pelo seletor de arquivos.
- Layout inspecionado em desktop e em largura de 375 px, sem transbordamento horizontal após o redimensionamento.
- Downloads reais de PNG e SVG confirmados. O PNG exportado tem 2400 × 1500 px, 3.437.464 pixels totalmente transparentes e 162.536 pixels com linhas semitransparentes. O SVG contém apenas linhas vetoriais e título.
- Nenhum erro ou aviso no console durante os testes de interação.

Esta verificação cobre o navegador. Nenhum teste de instalação UXP ou atualização de camada dentro do Photoshop foi realizado.
