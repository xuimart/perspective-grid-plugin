/*
 * Idiomas do painel (português e inglês). Padrão Xuimart: um botão PT/EN no
 * rodapé troca todos os textos na hora, e a escolha fica salva.
 *
 * Como funciona:
 * - O index.html marca cada texto com data-i18n (conteúdo) ou data-i18n-attr
 *   (atributos como aria-label/title/alt, no formato "atributo:chave").
 * - As strings criadas por JS (status, banner de atualização, dropdown de
 *   profundidade) usam PGI18n.t('chave', { ...vars }).
 * - applyStatic(root) percorre o DOM e aplica o idioma atual. É chamada no boot
 *   e toda vez que uma aba é remontada.
 *
 * Nunca mexe em id, value de <sp-menu-item> nem data-key: só troca texto.
 */
(function (root) {
  'use strict';

  var LANG_KEY = 'perspective-grid-lang';
  var DICT = {
    pt: {
      'lang.toggle': 'EN',
      'lang.name': 'Português',
      'tab.camera': 'Câmera',
      'tab.grid': 'Grade',
      'tab.model': 'Modelo',
      'preview.alt': 'Pré-visualização da grade',
      'preview.expand': 'Ampliar preview',
      'preview.collapse': 'Voltar ao painel (Esc)',
      'doc.none': 'Nenhum documento',
      'doc.dev': 'Modo desenvolvimento',
      'cam.perspective': 'Perspectiva',
      'preset.free': 'Livre',
      'preset.one': '1 ponto',
      'preset.two': '2 pontos',
      'preset.three': '3 pontos',
      'preset.five': 'Olho de peixe',
      'preset.ortho': 'Ortográfica',
      'cam.lens': 'Lente',
      'lens.custom': 'Personalizada',
      'cam.rotation': 'Rotação',
      'cam.tilt': 'Inclin.',
      'cam.view': 'Vista',
      'view.custom': 'Personalizada',
      'view.iso': 'Isométrica',
      'view.dimetric': 'Dimétrica',
      'view.trimetric': 'Trimétrica',
      'view.front': 'Frente',
      'view.right': 'Lado',
      'view.top': 'Topo',
      'sec.optics': 'Óptica',
      'cam.focal': 'Distância focal (mm)',
      'cam.distortion': 'Distorção (%)',
      'cam.zoom': 'Zoom da cena (%)',
      'sec.framing': 'Enquadramento',
      'cam.roll': 'Roll (inclinação)',
      'btn.reset': '↺ Restaurar cena',
      'grid.construction': 'Construção',
      'grid.rays': 'Raios de fuga',
      'grid.space': 'Malha espacial',
      'grid.floor': 'Chão alinhado',
      'grid.style': 'Estilo',
      'color.gray': 'Linha cinza',
      'color.black': 'Linha preta',
      'color.color': 'Linhas coloridas',
      'sec.guides': 'Número de linhas guias',
      'guides.showX': 'Mostrar guias X',
      'guides.showY': 'Mostrar guias Y',
      'guides.showZ': 'Mostrar guias Z',
      'sec.stroke': 'Traço',
      'grid.opacity': 'Opacidade',
      'grid.width': 'Espessura',
      'grid.vps': 'Pontos de fuga',
      'grid.show': 'Mostrar grade',
      'model.show': 'Mostrar',
      'model.label': 'Modelo',
      'model.none': 'Nenhum',
      'model.box': 'Caixa',
      'model.table': 'Mesa',
      'model.room': 'Quarto',
      'model.person': 'Personagem',
      'sec.dimensions': 'Dimensões',
      'model.size': 'Tamanho',
      'model.opacity': 'Opacidade do modelo',
      'btn.center': 'Centralizar',
      'btn.fit': 'Enquadrar',
      'model.advanced': 'Posição e profundidade',
      'sec.position': 'Posição no espaço',
      'sec.move': 'Movimento (arraste no preview)',
      'move.mode': 'Modo',
      'move.orbit': 'Girar câmera',
      'move.plane': 'Mover no plano',
      'move.depth': 'Profundidade por PF',
      'move.direction': 'Direção',
      'depth.pick': 'Selecione um PF',
      'btn.apply': 'Aplicar na camada',
      'btn.refresh': 'Atualizar malha',
      'status.openDoc': 'Abra um documento para começar.',
      'btn.checkUpdate': 'Verificar atualização',
      // dinâmicas (panel.js)
      'status.noPs': 'Photoshop indisponível.',
      'status.needDoc': 'Abra um documento primeiro.',
      'status.applying': 'Aplicando…',
      'status.layerCreated': 'Camada criada e atualizada.',
      'status.gridUpdated': 'Grade atualizada.',
      'status.error': 'Erro: {msg}',
      'status.ready': 'Pronto. Ajuste e clique em Aplicar/Atualizar.',
      'status.localPreview': 'Prévia local. Aplicar e atualizar exigem Photoshop.',
      'status.sceneReset': 'Cena restaurada.',
      'status.enableShow': 'Ative "Mostrar".',
      'status.modelFit': 'Modelo enquadrado.',
      'status.modelMoving': 'Movendo o modelo. Shift + Alt + Z volta ao centro.',
      'status.enableModel': 'Ative o modelo na aba Modelo para movê-lo.',
      'status.modelCentered': 'Posição do modelo restaurada.',
      'status.orthoNoLens': 'A ortográfica não usa lente: troque a perspectiva para mudar os mm.',
      'status.focal': 'Distância focal: {mm} mm',
      // dinâmicas (update.js)
      'update.new': 'Nova versão {version} disponível',
      'update.download': 'Baixar',
      'update.close': 'Fechar aviso de atualização',
      'update.openExternal': 'Abrir no navegador o download da nova versão do Perspective Grid.',
      'update.onlyInPs': 'A verificação de atualização só funciona dentro do Photoshop.',
      'update.checking': 'Verificando atualização…',
      'update.available': 'Nova versão {version} disponível.',
      'update.upToDate': 'Você já está na versão mais recente ({version}).',
      'update.failed': 'Não foi possível verificar agora. Confira a conexão com a internet e tente de novo.'
    },
    en: {
      'lang.toggle': 'PT',
      'lang.name': 'English',
      'tab.camera': 'Camera',
      'tab.grid': 'Grid',
      'tab.model': 'Model',
      'preview.alt': 'Grid preview',
      'preview.expand': 'Expand preview',
      'preview.collapse': 'Back to panel (Esc)',
      'doc.none': 'No document',
      'doc.dev': 'Development mode',
      'cam.perspective': 'Perspective',
      'preset.free': 'Free',
      'preset.one': '1 point',
      'preset.two': '2 points',
      'preset.three': '3 points',
      'preset.five': 'Fisheye',
      'preset.ortho': 'Orthographic',
      'cam.lens': 'Lens',
      'lens.custom': 'Custom',
      'cam.rotation': 'Rotation',
      'cam.tilt': 'Tilt',
      'cam.view': 'View',
      'view.custom': 'Custom',
      'view.iso': 'Isometric',
      'view.dimetric': 'Dimetric',
      'view.trimetric': 'Trimetric',
      'view.front': 'Front',
      'view.right': 'Side',
      'view.top': 'Top',
      'sec.optics': 'Optics',
      'cam.focal': 'Focal length (mm)',
      'cam.distortion': 'Distortion (%)',
      'cam.zoom': 'Scene zoom (%)',
      'sec.framing': 'Framing',
      'cam.roll': 'Roll (tilt)',
      'btn.reset': '↺ Reset scene',
      'grid.construction': 'Construction',
      'grid.rays': 'Vanishing rays',
      'grid.space': 'Spatial mesh',
      'grid.floor': 'Aligned floor',
      'grid.style': 'Style',
      'color.gray': 'Gray line',
      'color.black': 'Black line',
      'color.color': 'Colored lines',
      'sec.guides': 'Number of guide lines',
      'guides.showX': 'Show X guides',
      'guides.showY': 'Show Y guides',
      'guides.showZ': 'Show Z guides',
      'sec.stroke': 'Stroke',
      'grid.opacity': 'Opacity',
      'grid.width': 'Thickness',
      'grid.vps': 'Vanishing points',
      'grid.show': 'Show grid',
      'model.show': 'Show',
      'model.label': 'Model',
      'model.none': 'None',
      'model.box': 'Box',
      'model.table': 'Table',
      'model.room': 'Room',
      'model.person': 'Character',
      'sec.dimensions': 'Dimensions',
      'model.size': 'Size',
      'model.opacity': 'Model opacity',
      'btn.center': 'Center',
      'btn.fit': 'Fit',
      'model.advanced': 'Position and depth',
      'sec.position': 'Position in space',
      'sec.move': 'Movement (drag on the preview)',
      'move.mode': 'Mode',
      'move.orbit': 'Orbit camera',
      'move.plane': 'Move on plane',
      'move.depth': 'Depth toward VP',
      'move.direction': 'Direction',
      'depth.pick': 'Pick a VP',
      'btn.apply': 'Apply to layer',
      'btn.refresh': 'Refresh mesh',
      'status.openDoc': 'Open a document to begin.',
      'btn.checkUpdate': 'Check for updates',
      'status.noPs': 'Photoshop unavailable.',
      'status.needDoc': 'Open a document first.',
      'status.applying': 'Applying…',
      'status.layerCreated': 'Layer created and updated.',
      'status.gridUpdated': 'Grid updated.',
      'status.error': 'Error: {msg}',
      'status.ready': 'Ready. Adjust and click Apply/Refresh.',
      'status.localPreview': 'Local preview. Apply and refresh require Photoshop.',
      'status.sceneReset': 'Scene reset.',
      'status.enableShow': 'Turn on "Show".',
      'status.modelFit': 'Model fitted.',
      'status.modelMoving': 'Moving the model. Shift + Alt + Z recenters it.',
      'status.enableModel': 'Turn on the model in the Model tab to move it.',
      'status.modelCentered': 'Model position reset.',
      'status.orthoNoLens': 'Orthographic has no lens: switch perspective to change the mm.',
      'status.focal': 'Focal length: {mm} mm',
      'update.new': 'Version {version} available',
      'update.download': 'Download',
      'update.close': 'Dismiss update notice',
      'update.openExternal': 'Open the Perspective Grid update download in your browser.',
      'update.onlyInPs': 'Update checks only work inside Photoshop.',
      'update.checking': 'Checking for updates…',
      'update.available': 'Version {version} available.',
      'update.upToDate': 'You are on the latest version ({version}).',
      'update.failed': 'Could not check right now. Check your internet connection and try again.'
    }
  };

  var lang = 'pt';
  try {
    var saved = root.localStorage && localStorage.getItem(LANG_KEY);
    if (saved === 'pt' || saved === 'en') lang = saved;
  } catch (_) {}

  function t(key, vars) {
    var table = DICT[lang] || DICT.pt;
    var s = table[key] != null ? table[key] : (DICT.pt[key] != null ? DICT.pt[key] : key);
    if (vars) {
      for (var k in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, k)) s = s.split('{' + k + '}').join(String(vars[k]));
      }
    }
    return s;
  }

  // Aplica o idioma a todos os elementos marcados dentro de `root` (ou document).
  function applyStatic(scope) {
    scope = scope || document;
    var nodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], text = t(el.getAttribute('data-i18n'));
      el.textContent = text;
      // No CEP o sp-shim copia o texto do rótulo para um <span> visível quando o
      // elemento é criado (antes do i18n). O <sp-label> original fica escondido,
      // então também escrevemos no span visível para a troca aparecer na tela.
      // - sp-slider: o rótulo (sp-label) vira .sps-name no cabeçalho do slider.
      // - sp-checkbox: o texto filho vira um <span> dentro do .spc.
      if (el.tagName === 'SP-LABEL') {
        var slider = el.closest ? el.closest('sp-slider') : null;
        var name = slider && slider.querySelector('.sps-name');
        if (name) name.textContent = text;
      } else if (el.tagName === 'SP-CHECKBOX') {
        var cbSpan = el.querySelector('.spc > span');
        if (cbSpan) cbSpan.textContent = text;
      }
    }
    var attrNodes = scope.querySelectorAll('[data-i18n-attr]');
    for (var j = 0; j < attrNodes.length; j++) {
      // "aria-label:preview.expand; title:preview.expand"
      var spec = attrNodes[j].getAttribute('data-i18n-attr').split(';');
      for (var s2 = 0; s2 < spec.length; s2++) {
        var pair = spec[s2].split(':');
        if (pair.length === 2) attrNodes[j].setAttribute(pair[0].trim(), t(pair[1].trim()));
      }
    }
  }

  function set(next) {
    if (next !== 'pt' && next !== 'en') return lang;
    lang = next;
    try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}
    return lang;
  }

  root.PGI18n = {
    t: t,
    applyStatic: applyStatic,
    get: function () { return lang; },
    set: set,
    toggle: function () { return set(lang === 'pt' ? 'en' : 'pt'); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
