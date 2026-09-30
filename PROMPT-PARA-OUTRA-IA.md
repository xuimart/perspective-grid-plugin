# Continuação do Perspective Grid

Use a revisão 12 em index.html, LEIA-ME.md e FUNCIONAMENTO-DO-PLUGIN.md. Os registros antigos de VALIDACAO.md são históricos; não reintroduza recursos rejeitados com base neles.

Quero um plugin para artistas no Photoshop. Cubo de orientação e controles num painel compacto; grade e modelos no **canvas principal do documento Photoshop**, não numa segunda área de desenho no painel.

## Regras que não podem regredir

1. Grade/modelos compartilham câmera e projeção. Não reintroduzir Preservar forma, câmera local por modelo, Enquadramento natural ou escala não uniforme. Caixa com três dimensões iguais em 3D e diminuição pela profundidade.
2. Modos 1/2/3 PF persistentes. Em 1, arrasto muda enquadramento; em 2, gira horizontalmente e desloca verticalmente com verticais paralelas; em 3, inclina para o PF vertical. Nunca trocar automaticamente para Livre.
3. Olho de peixe permite girar/deslocar e usa projeção radial comum à grade/modelos. Cinco PFs são a vista frontal; após girar, marcar direções da semiesfera frontal. Distorção artística ajustável, sem alegar calibração comercial.
4. Lente 10 a 300 mm; zoom independente 25 a 300% dentro do canvas fixo. Scroll não altera lente. Alterar lente/distorção compensa distância para manter aproximadamente tamanho aparente, dentro dos limites. Distinguir zoom da cena e zoom da janela Photoshop.
5. Shift antes do arrasto move somente modelo em plano paralelo à câmera. Ctrl + Shift escolhe/trava eixo do PF apontado. Guia temporária, curva no olho de peixe. Eixo visto de ponta usa arrasto vertical para profundidade.
6. Caixa, mesa e quarto: posições independentes, escala uniforme e proteção do volume completo contra a câmera. Diorama como conjunto. Não deformar malhas para resolver enquadramento.
7. Enquadrar modelo ajusta câmera sem mover objeto; Restaurar cena recupera câmera/zoom/escala/posições no modo atual. Esc, perda de foco e cancelamento não podem deixar gestos presos.
8. X/Z/Y independentes, 1 a 64 guias, espessura/opacidade uniformes. PNG/SVG exportam grade/marcações habilitadas, sem modelo, imagem ou fundo.
9. Preservar testes e acrescentar regressões. Comparar pixels reais com projeção esperada, não apenas cálculos repetidos. Rodar geometria, interações e estabilidade; inspecionar desktop/celular.

## Próxima etapa: integração UXP

Ainda não existe integração instalada. Consulte documentação oficial atual da Adobe e confirme capacidades da versão alvo. Three.js/WebGL2 no navegador não implica compatibilidade UXP.

Separar controles, estado, geometria, rasterização e escrita no host. Provar primeiro cubo -> câmera -> grade -> camada no documento correto. Grupo próprio com Guias, Marcações e Modelo de referência; IDs explícitos e preservação da camada de pintura selecionada.

Avaliar Imaging API, putPixels, executeAsModal, alpha, cor, histórico e cancelamento. Não inventar overlay/captura de gestos sobre o documento. Não interceptar scroll global nem oferecer encaixe automático do pincel como recurso existente.

Uma escrita em andamento e somente última revisão pendente. Invalidar ao trocar/fechar/redimensionar documento. Começar aplicando ao soltar; medir antes de prometer atualização contínua. Tratar grupo removido, host ocupado, PSD não salvo, artboards, resolução grande e persistência por documento.

Entregar projeto executável, instruções, manifesto quando existir, testes e distinção entre navegador, Photoshop e pendências. Não apresentar prova visual como integração homologada.
