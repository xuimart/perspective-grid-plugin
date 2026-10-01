/*
 * Aviso de atualização no padrão Xuimart (SISTEMA_DE_UPDATE_XUIMART.md).
 *
 * Ao abrir o painel, lê um version.json público e, se houver versão mais nova
 * que a instalada, mostra um aviso com o changelog e um botão que abre o
 * download no navegador. Nada é instalado sozinho: o usuário decide.
 *
 * Regras do padrão: o check é silencioso e nunca bloqueia o painel; qualquer
 * falha (sem internet, timeout, JSON inválido) é ignorada; o aviso fechado só
 * volta na próxima abertura ou num "Verificar atualização" manual.
 */
(function (root) {
  'use strict';

  // Hospedado no próprio repositório (opção "GitHub raw" do guia). O domínio
  // precisa constar em requiredPermissions.network.domains no manifest.
  // A versão CEP define PG_UPDATE_URL antes deste arquivo; null desliga o aviso
  // (o version.json do UXP aponta para o .ccx, que não serve no Photoshop 2020).
  const UPDATE_CHECK_URL = root.PG_UPDATE_URL !== undefined ? root.PG_UPDATE_URL
    : 'https://raw.githubusercontent.com/xuimart/perspective-grid-plugin/master/version.json';
  const TIMEOUT_MS = 8000;

  function uxpModule() {
    try { return require('uxp'); } catch (_) { return null; }
  }

  // Versão instalada = a do manifest. Fonte única: não existe uma constante
  // separada para esquecer de atualizar. Na versão CEP vem de PG_VERSION, que o
  // build-cep.cjs gera a partir do mesmo manifest. Fora do Photoshop: null.
  function localVersion() {
    const u = uxpModule();
    if (u && u.versions && u.versions.plugin) return String(u.versions.plugin);
    return root.PG_VERSION ? String(root.PG_VERSION) : null;
  }

  // SemVer numérico por segmento; sufixos como "-beta" são ignorados.
  function compareVersions(a, b) {
    const pa = String(a).split('.'), pb = String(b).split('.');
    for (let i = 0; i < 3; i++) {
      const na = parseInt(pa[i], 10) || 0, nb = parseInt(pb[i], 10) || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  // Valida o JSON remoto. Só aceita link https: o painel nunca abre outro
  // esquema vindo da internet.
  function parse(data) {
    if (!data || typeof data.version !== 'string' || !/^\d+(\.\d+){0,2}/.test(data.version)) return null;
    if (typeof data.downloadUrl !== 'string' || data.downloadUrl.indexOf('https://') !== 0) return null;
    return {
      version: data.version,
      downloadUrl: data.downloadUrl,
      changelog: typeof data.changelog === 'string' ? data.changelog : ''
    };
  }

  function fetchRemote() {
    // ?t= evita cache de rede; o timeout impede uma espera longa sem resposta.
    const request = fetch(UPDATE_CHECK_URL + '?t=' + Date.now()).then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
    return Promise.race([request, timeout]);
  }

  function openDownload(url) {
    const u = uxpModule();
    if (u && u.shell && u.shell.openExternal) {
      // O Photoshop pede confirmação ao usuário; este texto aparece no diálogo.
      return u.shell.openExternal(url, 'Abrir no navegador o download da nova versão do Perspective Grid.');
    }
    if (root.cep && root.cep.util && root.cep.util.openURLInDefaultBrowser) {
      root.cep.util.openURLInDefaultBrowser(url);
      return Promise.resolve('');
    }
    try { window.open(url); } catch (_) {}
    return Promise.resolve('');
  }

  function removeBanner() {
    const old = document.getElementById('updateBanner');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  function showBanner(update, onLayout) {
    removeBanner();
    const banner = document.createElement('div');
    banner.id = 'updateBanner';
    banner.className = 'update-banner';
    banner.setAttribute('role', 'status');

    const text = document.createElement('div');
    text.className = 'update-text';
    const title = document.createElement('strong');
    title.textContent = 'Nova versão ' + update.version + ' disponível';
    text.appendChild(title);
    if (update.changelog) {
      const log = document.createElement('span');
      log.textContent = update.changelog; // textContent: o JSON remoto nunca vira HTML
      text.appendChild(log);
    }

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'primary';
    download.textContent = 'Baixar';
    download.addEventListener('click', () => { openDownload(update.downloadUrl); });

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'update-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Fechar aviso de atualização');
    close.addEventListener('click', () => { removeBanner(); if (onLayout) onLayout(); });

    banner.appendChild(text);
    banner.appendChild(download);
    banner.appendChild(close);
    const panel = document.querySelector('.panel');
    panel.insertBefore(banner, panel.firstChild);
    if (onLayout) onLayout();
  }

  // opts: { manual, onStatus(msg, kind), onLayout() }. No modo automático não
  // escreve nada na barra de status: só aparece algo se houver versão nova.
  async function check(opts) {
    if (!UPDATE_CHECK_URL) return null; // aviso desligado nesta versão
    const o = opts || {};
    const say = o.manual && o.onStatus ? o.onStatus : () => {};
    const current = localVersion();
    if (!current) { say('A verificação de atualização só funciona dentro do Photoshop.', 'error'); return null; }
    say('Verificando atualização…');
    try {
      const remote = parse(await fetchRemote());
      if (!remote) throw new Error('version.json inválido');
      if (compareVersions(remote.version, current) > 0) {
        showBanner(remote, o.onLayout);
        say('Nova versão ' + remote.version + ' disponível.', 'ok');
        return remote;
      }
      say('Você já está na versão mais recente (' + current + ').', 'ok');
      return null;
    } catch (_) {
      say('Não foi possível verificar agora. Confira a conexão com a internet e tente de novo.', 'error');
      return null;
    }
  }

  root.PGUpdate = { check, compareVersions, parse, localVersion, UPDATE_CHECK_URL };
})(typeof window !== 'undefined' ? window : globalThis);
