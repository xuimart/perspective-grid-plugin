# Perspective Grid UXP — Status vs. Especificação (Edição 1)

Comparação honesta entre a versão instalada (v0.1.9) e a especificação. Três
estados por item: **[OK]** implementado e verificado no host, **[PARCIAL]**
existe mas incompleto/não conforme, **[FALTA]** não feito. Onde a spec conflita
com um limite real da plataforma UXP que já testamos, está marcado **[CONFLITO]**
com a explicação.

## Já implementado e testado no Photoshop (v0.1.9)

- [OK] Grade escrita numa camada de pixels do documento, nas dimensões reais (Imaging API + executeAsModal). Provado no host (documento 3840×2160).
- [OK] Núcleo geometry.js reaproveitado sem alteração (câmera única, projeção, modos, PFs). 39 testes de regressão passando.
- [OK] Rasterizador próprio em JS puro (raster.js) — necessário porque o canvas UXP não tem getImageData. Inclui encoder PNG próprio.
- [OK] Modelos Caixa/Mesa/Quarto portados 1:1 do reference-scene.js como wireframe (mesmas caixas, tamanhos, posições, cores).
- [OK] Preview no painel (fundo branco) via encodeImageData num <img>; arraste no preview gira a câmera.
- [OK] Painel com gavetas (accordion), rolagem vertical, redimensionável; dropdowns Spectrum (sp-dropdown) em vez de <select> nativo (que bugava o layout).
- [OK] Controles: preset, lente(preset), distorção, yaw, pitch, roll, distância, zoom, pan X/Y, vista Frente/Lado/Topo/¾, restaurar; grade (construção, perfis, X/Z/Y, contagens, opacidade, espessura, cores, toggles); modelo (mostrar, tipo, tamanho, centralizar).
- [OK] Aplicar ao soltar / Atualizar ao mover (debounce 350ms + fila de 1 pendente).
- [OK] Export PNG transparente (fallback Opção B) via encoder próprio.
- [OK] Instalação via UPIA (.ccx) + script deploy-uxp.ps1. Versionado em git (tag v0.1.9).

## Parcial — existe mas não conforme à spec

- [PARCIAL] Layout do painel (seção 4): tem gavetas e rolagem, mas falta o cubo de orientação clicável, os quatro modos segmentados (Girar/Enquadramento/Modelo/Profundidade), e o estado textual (Sem documento/Pronto/Pendente/Aplicando/Erro) completo.
- [PARCIAL] Modelos (seção 9): são wireframe, não têm faces sombreadas nem oclusão por depth buffer. A spec aceita "faces levemente diferenciadas e contorno legível"; hoje só temos contorno.
- [PARCIAL] Grade em camadas separadas (seção 12): hoje tudo vai numa única camada "Perspective Grid". A spec pede grupo com Modelo/Marcações/Guias separados.
- [PARCIAL] Persistência (seção 16): usa localStorage no painel. A spec pede estado no lado UXP + por documento + UUID de instância.
- [PARCIAL] Espessura em px do documento (seção 11): escala pela base 1600; falta validar a conversão exata para documentos grandes.
- [PARCIAL] Movimento do modelo (seção 10): o núcleo tem moveModel/moveModelOnAxis, mas o painel ainda não expõe Mover modelo, Profundidade por PF nem campos XYZ.

## Falta — não implementado

- [FALTA] Cubo de orientação 3D no painel (seção 4.2). Hoje o giro é por arraste no preview + sliders.
- [FALTA] Quatro modos de interação segmentados: Girar / Enquadramento / Modelo / Profundidade (seção 3).
- [FALTA] Seletor de PF para profundidade com rótulo/eixo/direção (seção 3, 10.2).
- [FALTA] Campos XYZ de posição do modelo + centralizar/enquadrar do modelo (seção 4.5).
- [FALTA] Export SVG (seção 18) — o núcleo já gera SVG (G.svg); falta ligar no painel UXP.
- [FALTA] Import de referência (imagem) em camada separada (seção 18).
- [FALTA] Grupo de camadas com IDs próprios, proteção de camada, reconstrução (seção 12).
- [FALTA] Protocolo versionado / arquitetura WebView (seções 13, 14) — hoje é painel direto, sem WebView.
- [FALTA] JSON de projeto salvável/importável (seção 16, 18).
- [FALTA] Estados de erro completos e recuperação (seção 20).
- [FALTA] Suite de testes do host (seção 21) e matriz de compatibilidade.
- [FALTA] Empacotamento .ccx oficial pelo UDT (hoje é .ccx montado à mão + UPIA, que funciona mas não é o fluxo homologado).

## Conflitos com a realidade da plataforma (já verificados)

- [CONFLITO] **Modelos com WebGL/Three.js no painel (seções 6, 8, 13).** O canvas do UXP não roda WebGL de forma confiável e não tem getImageData. Por isso os modelos são wireframe em JS puro, não malhas Three.js sombreadas. A spec prevê a rota WebView para contornar isso — é possível, mas é uma refação grande e precisa de prova de WebGL2 na WebView antes de prometer. Enquanto isso, wireframe é o caminho estável.
- [CONFLITO] **Grade/gestos em tempo real sobre o canvas nativo (seções 1, 3).** Não existe overlay ao vivo sobre o canvas do Photoshop, nem captura de gestos sobre o documento. A própria spec já reconhece isso (marca como "melhoria condicionada a API validada"). O fallback do painel é o que funciona: arraste no preview + aplicar na camada.
- [CONFLITO] **Olho de peixe com 192 subdivisões sombreadas (seção 8).** As curvas da grade funcionam (núcleo puro). Modelos curvos sombreados no fisheye dependeriam de WebGL — mesmo conflito acima.
- [NOTA] **input[type=color] (seção 4.6, swatches).** Não funciona no UXP; hoje uso campo de texto hex + amostra. Um color picker real exigiria widget Spectrum.

## Ordem sugerida para os próximos ciclos (alinhada à seção 22)

Priorizando o que dá mais valor com menor risco de plataforma:

1. **Interação do modelo no painel** — Mover modelo, Profundidade por PF (seletor), campos XYZ, centralizar/enquadrar. Núcleo já existe; é ligar na UI.
2. **Cubo de orientação no painel** — desenhar o cubo (JS puro, como o gizmo do protótipo) e permitir clicar faces / arrastar.
3. **Camadas separadas** (Guias / Marcações / Modelo) com grupo e IDs próprios + proteção.
4. **Export SVG** no painel (núcleo pronto) e **JSON de projeto** salvar/importar.
5. **Persistência no lado UXP** por documento + UUID de instância.
6. **Estados de erro/recuperação** completos e **matriz de compatibilidade**.
7. **Decisão sobre WebView + WebGL** para modelos sombreados — só após prova de conceito de WebGL2 na WebView da versão instalada. Se falhar, manter wireframe (escopo reduzido declarado).
8. **Empacotamento oficial** pelo UDT quando o UDT estiver instalado.

## Observações de honestidade (conforme a própria spec exige)

- O que está no host e verificado: escrita da grade na camada, preview, modelos wireframe, controles, aplicar ao soltar/ao mover.
- O que NÃO foi testado como a spec pede: comportamento com troca de documento durante escrita, desfazer/refazer por gesto, proteção de camada, memória em documentos muito grandes, temas claros, larguras 280/480.
- Nada aqui foi homologado — é desenvolvimento. Testes de Node (geometria) não são prova de integração com o host.
