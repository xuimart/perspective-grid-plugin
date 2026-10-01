/*
 * Perspective Grid - ponte ExtendScript da versao CEP (Photoshop CC 2018+).
 *
 * ExtendScript e ES3: sem JSON nativo, sem let/const/arrow. As respostas para o
 * painel sao strings JSON montadas a mao. Mantenha este arquivo em ASCII.
 */
var PG_LAYER_NAME = 'Perspective Grid';
var pgCtx = null; // dados para pgReplaceOld (suspendHistory roda uma string)

function pgEsc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\t]/g, ' ');
}

function pgTarget(classId) {
  var ref = new ActionReference();
  ref.putEnumerated(charIDToTypeID(classId), charIDToTypeID('Ordn'), charIDToTypeID('Trgt'));
  return executeActionGet(ref);
}

// Documento ativo em pixels. O ActionManager devolve largura e altura em pontos
// (1/72 pol.), por isso a conversao pela resolucao; nao mexe nas preferencias.
function pgDocInfo() {
  try {
    if (!app.documents.length) return 'null';
    var d = pgTarget('Dcmn');
    var res = d.getUnitDoubleValue(stringIDToTypeID('resolution'));
    var w = Math.round(d.getUnitDoubleValue(stringIDToTypeID('width')) * res / 72);
    var h = Math.round(d.getUnitDoubleValue(stringIDToTypeID('height')) * res / 72);
    return '{"id":' + d.getInteger(stringIDToTypeID('documentID')) +
      ',"width":' + w + ',"height":' + h +
      ',"title":"' + pgEsc(d.getString(stringIDToTypeID('title'))) + '"}';
  } catch (e) {
    return 'null';
  }
}

function pgActiveLayerId() {
  return pgTarget('Lyr ').getInteger(stringIDToTypeID('layerID'));
}

function pgSelectLayerById(id) {
  var ref = new ActionReference();
  ref.putIdentifier(charIDToTypeID('Lyr '), id);
  var desc = new ActionDescriptor();
  desc.putReference(charIDToTypeID('null'), ref);
  desc.putBoolean(charIDToTypeID('MkVs'), false);
  executeAction(charIDToTypeID('slct'), desc, DialogModes.NO);
}

// Grade anterior quando o painel nao sabe o id (ex.: painel reaberto): a camada
// de topo com o nome da grade, igual ao comportamento da versao UXP.
function pgFindGridLayer(doc, skipId) {
  for (var i = 0; i < doc.layers.length; i++) {
    if (doc.layers[i].name !== PG_LAYER_NAME) continue;
    doc.activeLayer = doc.layers[i];
    var id = pgActiveLayerId();
    if (id !== skipId) return id;
  }
  return null;
}

// Troca a grade antiga pela nova no mesmo lugar da pilha de camadas.
function pgReplaceOld() {
  var c = pgCtx;
  try {
    pgSelectLayerById(c.oldId);
    var old = c.doc.activeLayer;
    c.fresh.move(old, ElementPlacement.PLACEBEFORE);
    old.remove();
    c.created = false;
  } catch (e) {
    // A camada antiga sumiu ou esta bloqueada: fica so a nova.
  }
  c.doc.activeLayer = c.fresh;
}

// path: PNG do tamanho do documento. existingId: id da grade anterior ou null.
function pgApplyGrid(path, existingId) {
  var dialogs = app.displayDialogs;
  var src = null;
  var file = new File(path);
  app.displayDialogs = DialogModes.NO; // sem dialogo de perfil de cor ao abrir o PNG
  try {
    if (!app.documents.length) return '{"error":"Nenhum documento aberto."}';
    if (!file.exists) return '{"error":"Arquivo temporario da grade nao encontrado."}';
    var target = app.activeDocument;

    // 1. Abre o PNG e duplica a camada dele para o documento. Duplicar copia os
    //    pixels 1:1, sem a escala por resolucao que o "Inserir" aplicaria.
    src = app.open(file);
    src.activeLayer.name = PG_LAYER_NAME;
    src.activeLayer.duplicate(target, ElementPlacement.PLACEATBEGINNING);
    src.close(SaveOptions.DONOTSAVECHANGES);
    src = null;
    app.activeDocument = target;
    var fresh = target.layers[0];
    target.activeLayer = fresh;
    var freshId = pgActiveLayerId();

    // 2. Substitui a grade anterior num unico passo do historico.
    var oldId = existingId ? existingId : pgFindGridLayer(target, freshId);
    pgCtx = { doc: target, fresh: fresh, oldId: oldId, created: true };
    if (oldId && oldId !== freshId) target.suspendHistory('Atualizar grade de perspectiva', 'pgReplaceOld()');
    target.activeLayer = fresh;
    return '{"layerID":' + freshId + ',"created":' + pgCtx.created + '}';
  } catch (e) {
    return '{"error":"' + pgEsc(e.message || e) + '"}';
  } finally {
    if (src) { try { src.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
    try { file.remove(); } catch (e3) {}
    pgCtx = null;
    app.displayDialogs = dialogs;
  }
}
