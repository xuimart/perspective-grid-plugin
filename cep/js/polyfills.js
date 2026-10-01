/*
 * Recursos que o Chromium 57 (CEP 8, o do Photoshop CC 2018) ainda não tem e que
 * o código compartilhado com o UXP usa. A sintaxe moderna (?. etc.) o
 * build-cep.cjs converte; métodos de biblioteca precisam existir em runtime.
 */
(function () {
  'use strict';
  if (typeof window.globalThis === 'undefined') window.globalThis = window;

  function define(proto, name, fn) {
    if (!proto[name]) Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true });
  }

  define(Array.prototype, 'at', function (index) {
    let i = Math.trunc(Number(index)) || 0;
    if (i < 0) i += this.length;
    return i < 0 || i >= this.length ? undefined : this[i];
  });

  define(Array.prototype, 'flat', function (depth) {
    const d = depth === undefined ? 1 : Math.trunc(Number(depth)) || 0;
    const out = [];
    (function walk(list, level) {
      for (let i = 0; i < list.length; i++) {
        if (Array.isArray(list[i]) && level > 0) walk(list[i], level - 1);
        else out.push(list[i]);
      }
    })(this, d);
    return out;
  });

  define(Array.prototype, 'flatMap', function (fn, thisArg) {
    return Array.prototype.concat.apply([], this.map(fn, thisArg));
  });
})();
