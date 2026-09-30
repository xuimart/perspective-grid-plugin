# Perspective Grid — plugin UXP para Photoshop

Adaptação do protótipo web para um plugin de painel no Photoshop. A grade é
renderizada nas dimensões reais do documento e aplicada numa camada de pixels
dedicada ("Perspective Grid").

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `manifest.json` | Metadados do plugin (manifestVersion 5, host PS, painel). |
| `index.html` | Painel: preview + controles + ações. |
| `styles.css` | Estilos do painel. |
| `geometry.js` | Núcleo compartilhado com o protótipo (câmera, projeção, linhas). Não editar aqui; é cópia de `../geometry.js`. |
| `ps-adapter.js` | Ponte com o Photoshop: Imaging API + `executeAsModal`. |
| `panel.js` | Controlador: estado → preview → buffer RGBA → adaptador. |
| `icons/icon.png` | Ícone do painel. |

## O que faz hoje

- **Opção A — Aplicar grade na camada:** renderiza a grade no tamanho real do
  documento e escreve na camada "Perspective Grid" via `putPixels`, dentro de
  uma transação de desfazer. A miniatura da camada no painel Layers atualiza
  sozinha (o Photoshop regenera). Cria a camada na primeira aplicação.
- **Atualizar ao mover:** aplica automaticamente com um pequeno atraso (250 ms)
  ao mexer nos controles. É "quase em tempo real", limitado pela natureza modal
  da escrita — não é 60 fps sobre o canvas (a plataforma não permite overlay).
- **Opção B — Exportar PNG:** fallback. Gera um PNG 2400 px e salva via diálogo.

## Limitações conhecidas (plataforma, não bug)

- Não existe overlay flutuante sobre o canvas nativo no UXP. "Grade no canvas"
  significa uma camada de pixels do documento.
- Cada atualização é uma transação `executeAsModal`. Movimento contínuo a alta
  taxa de quadros sobre o documento não é suportado.
- O modelo 3D (caixa/mesa/quarto) ainda não vai para o documento; só a grade de
  linhas. O preview do painel mostra a grade.

## Como carregar e testar (Adobe UXP Developer Tool)

Pré-requisitos: Photoshop 24.0+ e o **Adobe UXP Developer Tool** (UDT),
instalável pelo Creative Cloud Desktop.

1. Abra o Photoshop e um documento RGB 8 bits (primeiro alvo suportado).
2. Abra o UDT.
3. **Add Plugin** → selecione `uxp/manifest.json`.
4. Na linha do plugin, **Load** (carrega o painel no Photoshop).
5. No Photoshop: menu **Plugins → Perspective Grid** para exibir o painel.
6. Ajuste a grade e clique **Aplicar grade na camada**. Uma camada
   "Perspective Grid" aparece com a grade nas dimensões do documento.
7. Use **Debug** no UDT para abrir o console e ver logs/erros.

Ao editar arquivos do plugin, use **Reload** (ou o watch do UDT) para recarregar.

## Sincronizar o núcleo

`uxp/geometry.js` é uma cópia de `../geometry.js`. Se o núcleo mudar, copie de
novo:

```powershell
Copy-Item geometry.js uxp\geometry.js -Force
```

## Roadmap curto

- Persistência por documento (hoje o estado é por origem, como no protótipo).
- Guardar o `layerID` da grade nos metadados do documento.
- Avaliar levar o modelo 3D para o documento se você optar por isso.
- Testar modos além de RGB 8 bits (16/32 bits, CMYK) antes de prometer suporte.
