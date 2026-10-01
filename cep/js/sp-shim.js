/*
 * Widgets Spectrum (sp-*) para a versão CEP.
 *
 * O painel foi escrito para o UXP, que tem sp-slider, sp-dropdown e sp-checkbox
 * prontos. O CEP é um Chromium comum e não tem esses elementos, então aqui eles
 * viram custom elements que desenham controles HTML nativos por dentro e
 * expõem a mesma API que o panel.js usa: value, selectedIndex, checked, o
 * atributo disabled e os eventos input/change (que borbulham do controle
 * interno até o elemento).
 *
 * Cada elemento monta o conteúdo uma única vez: o painel tira e recoloca as
 * abas inativas no DOM, e isso não pode duplicar os controles.
 */
(function () {
  'use strict';
  if (!window.customElements) return;

  function decimals(step) {
    const s = String(step || 1), dot = s.indexOf('.');
    return dot < 0 ? 0 : s.length - dot - 1;
  }

  // Só guardam dados (rótulo e opções); os widgets abaixo leem deles.
  customElements.define('sp-label', class extends HTMLElement {});
  customElements.define('sp-menu', class extends HTMLElement {});
  customElements.define('sp-menu-item', class extends HTMLElement {});

  customElements.define('sp-slider', class extends HTMLElement {
    static get observedAttributes() { return ['disabled']; }
    connectedCallback() {
      if (this._input) return;
      const label = this.querySelector('sp-label');
      const head = document.createElement('div');
      head.className = 'sps-head';
      const name = document.createElement('span');
      name.className = 'sps-name';
      name.textContent = label ? label.textContent : '';
      const out = document.createElement('span');
      out.className = 'sps-value';
      head.appendChild(name);
      head.appendChild(out);

      const input = document.createElement('input');
      input.type = 'range';
      ['min', 'max', 'step'].forEach(a => { if (this.hasAttribute(a)) input.setAttribute(a, this.getAttribute(a)); });
      const initial = this._pending != null ? this._pending : this.getAttribute('value');
      if (initial != null) input.value = initial;

      this.appendChild(head);
      this.appendChild(input);
      this._input = input;
      this._out = out;
      this._decimals = decimals(this.getAttribute('step'));
      input.addEventListener('input', () => this._show());
      input.addEventListener('change', () => this._show());
      this._show();
      this._syncDisabled();
    }
    attributeChangedCallback() { this._syncDisabled(); }
    _syncDisabled() { if (this._input) this._input.disabled = this.hasAttribute('disabled'); }
    _show() { if (this._out) this._out.textContent = Number(this._input.value).toFixed(this._decimals); }
    get value() {
      if (this._input) return Number(this._input.value);
      return Number(this._pending != null ? this._pending : this.getAttribute('value'));
    }
    set value(v) {
      if (this._input) { this._input.value = v; this._show(); }
      else this._pending = v;
    }
  });

  customElements.define('sp-dropdown', class extends HTMLElement {
    static get observedAttributes() { return ['disabled']; }
    connectedCallback() {
      if (this._select) return;
      const select = document.createElement('select');
      this._select = select;
      this.appendChild(select);
      this._rebuild();
      if (this._pendingIndex != null) select.selectedIndex = this._pendingIndex;
      // O painel reescreve as opções de alguns menus (ex.: direção por PF).
      const menu = this.querySelector('sp-menu');
      if (menu && window.MutationObserver) {
        new MutationObserver(() => this._rebuild()).observe(menu, { childList: true, subtree: true });
      }
      this._syncDisabled();
    }
    attributeChangedCallback() { this._syncDisabled(); }
    _syncDisabled() { if (this._select) this._select.disabled = this.hasAttribute('disabled'); }
    _rebuild() {
      const select = this._select, keep = select.selectedIndex;
      while (select.firstChild) select.removeChild(select.firstChild);
      Array.prototype.forEach.call(this.querySelectorAll('sp-menu-item'), item => {
        const option = document.createElement('option');
        option.value = item.getAttribute('value') || '';
        option.textContent = item.textContent;
        select.appendChild(option);
      });
      if (keep >= 0 && keep < select.options.length) select.selectedIndex = keep;
    }
    get selectedIndex() {
      if (this._select) return this._select.selectedIndex;
      return this._pendingIndex != null ? this._pendingIndex : -1;
    }
    set selectedIndex(i) {
      if (this._select) this._select.selectedIndex = i;
      else this._pendingIndex = i;
    }
  });

  customElements.define('sp-checkbox', class extends HTMLElement {
    static get observedAttributes() { return ['disabled']; }
    connectedCallback() {
      if (this._input) return;
      const label = document.createElement('label');
      label.className = 'spc';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = this._pending != null ? this._pending : this.hasAttribute('checked');
      const aria = this.getAttribute('aria-label');
      if (aria) input.setAttribute('aria-label', aria);
      const text = document.createElement('span');
      while (this.firstChild) text.appendChild(this.firstChild);
      label.appendChild(input);
      if (text.childNodes.length) label.appendChild(text);
      this.appendChild(label);
      this._input = input;
      this._syncDisabled();
    }
    attributeChangedCallback() { this._syncDisabled(); }
    _syncDisabled() { if (this._input) this._input.disabled = this.hasAttribute('disabled'); }
    get checked() {
      if (this._input) return this._input.checked;
      return this._pending != null ? this._pending : this.hasAttribute('checked');
    }
    set checked(v) {
      if (this._input) this._input.checked = !!v;
      else this._pending = !!v;
    }
  });
})();
