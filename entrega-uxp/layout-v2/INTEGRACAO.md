# Layout de referencia aprovado para Perspective Grid

ATUALIZACAO: a imagem fornecida pelo usuario substitui a hierarquia visual anterior. Agora o topo tem uma previa grande 16:9 com a cena, sem cubo separado. As abas usam sublinhado vermelho. O rodape tem Aplicar na camada e Atualizar malha. Camera usa menus de perspectiva/lente, rotacao e inclinacao compactas e sliders separados de lente e zoom. Grade agrupa X/Z/Y numa linha. Modelo tem tamanho, opacidade e acoes. Posicao e profundidade permanecem em uma secao expansivel. reference-layout.css e reference-layout.js adaptam a previa existente a essa referencia. Esta continua sendo uma previa de navegador, nao uma instalacao UXP.

Esta pasta e uma referencia visual interativa, nao um plugin instalado. Nao substitui os arquivos UXP que estavam recebendo alteracoes simultaneas. Abrir index.html diretamente no navegador. Os comandos de Photoshop informam que precisam da integracao, sem simular sucesso.

## Hierarquia

- Previa grande da cena conforme imagem do usuario; o resultado final continua nas camadas do Photoshop.
- Identificacao do documento na previa e seletor de vistas na aba Camera.
- Abas Camera, Grade e Modelo. Apenas uma pagina visivel.
- Somente a area central rola; aplicar, exportar e status permanecem acessiveis.
- Escala uniforme e posicao XYZ ficam na aba Modelo. Profundidade usa seletor de PF e comandos de aproximacao/afastamento.
- Lente e zoom sao campos independentes. Distorcao aparece somente no olho de peixe.
- Numeros editaveis junto aos sliders. Espacamento por margens explicitas, sem depender de gap.

## Integrar no UXP existente

1. Preservar manifest, ID, geometria, adaptador Photoshop e persistencia. Nao copiar o script de demonstracao como motor 3D.
2. Usar esta hierarquia e medidas no painel existente. Trocar selects por sp-dropdown e cores por controles suportados no host. Conectar os controles aos comandos atuais, sem reconstruir o projeto.
3. O cabecalho Perspective Grid representa a faixa visual; nao duplicar o titulo se o host ja o exibir. Remover LAYOUT 02 e documento de exemplo da versao de producao.
4. Raiz ocupa a area disponibilizada pelo host. Flex vertical; cabecalho, orientacao, abas e rodape com flex-shrink 0. Area central com flex 1 1 0, min-height 0 e overflow-y auto.
5. Linhas e grupos de parametros nao podem encolher: flex-shrink 0 ou fluxo normal de blocos. Nenhuma altura fixa nos grupos longos. Nao sobrepor widgets nativos com position absolute.
6. Se widgets de abas ocultas vazarem no UXP, desmontar a aba inativa mantendo seu estado no controller. Reinstalar listeners por delegacao e sincronizar valores ao montar.
7. Cubo visual desta previa apenas demonstra orientacao. Em producao usar o renderer ja validado, com as mesmas restricoes de camera do documento. Nao usar as linhas deste indicador como modelo de referencia.
8. Aplicar, PNG, SVG, atualizar ao soltar e enquadrar precisam dos handlers reais. Desabilitar acoes sem documento ou enquanto indisponiveis. Nao anunciar atualizacao interativa sem teste de latencia/historico.
9. Usar icones da biblioteca existente para restaurar e exportar quando houver suporte, com tooltip e nome acessivel. Sem SVG manual novo nem CDN.

## Verificacao no Photoshop

Testar 320x420, 340x640, 360x700 e 480x900; todas as abas; abrir/fechar; redimensionar e alternar abas repetidamente. Confirmar rodape acessivel, nenhuma rolagem horizontal, nenhuma sobreposicao, numericos editaveis, dropdowns abrindo, foco e Tab. O teste no navegador nao comprova o layout nativo UXP.

Referencias oficiais de CSS consultadas: https://developer.adobe.com/photoshop/uxp/2022/uxp/reference-css/Styles/flex/ e https://developer.adobe.com/photoshop/uxp/2021/uxp/reference-css/Styles/overflow/ . Preferir propiedades documentadas e validar no host alvo.
