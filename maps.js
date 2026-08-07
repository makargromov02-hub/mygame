(function () {
  'use strict';

  const MAPS = [
    {
      id: 'city',
      title: 'Город',
      status: 'Готово',
      implemented: true,
      description: 'Текущая городская карта со зданиями, дорогами и укрытиями.'
    },
    {
      id: 'industrial',
      title: 'Промзона',
      status: 'В разработке',
      implemented: false,
      description: 'Шаблон для будущей карты с цехами, трубами и складами.'
    },
    {
      id: 'forest',
      title: 'Лес',
      status: 'В разработке',
      implemented: false,
      description: 'Шаблон для будущей карты с деревьями, тропами и лагерями.'
    },
    {
      id: 'desert',
      title: 'Пустыня',
      status: 'В разработке',
      implemented: false,
      description: 'Шаблон для будущей карты с песком, руинами и каньонами.'
    }
  ];

  class MapSelectionSystem {
    constructor(elements, callbacks) {
      this.elements = elements;
      this.callbacks = callbacks || {};
      this.currentMapId = 'city';
      this.render();
      this.bindUi();
    }

    bindUi() {
      if (this.elements.mapButton) {
        this.elements.mapButton.addEventListener('click', () => this.open());
      }

      if (this.elements.startMapButton) {
        this.elements.startMapButton.addEventListener('click', () => this.open());
      }

      if (this.elements.mapItems) {
        this.elements.mapItems.addEventListener('click', (event) => {
          const button = event.target.closest('[data-map-id]');
          if (!button) return;
          this.select(button.dataset.mapId);
        });
      }
    }

    open() {
      if (!this.elements.mapDialog) return;
      this.elements.mapDialog.classList.remove('hidden');
      this.setMessage('');
      this.render();
      if (this.callbacks.onOpen) this.callbacks.onOpen();
    }

    close() {
      if (this.elements.mapDialog) {
        this.elements.mapDialog.classList.add('hidden');
      }
    }

    select(id) {
      const map = MAPS.find((entry) => entry.id === id);
      if (!map) return;

      if (!map.implemented) {
        this.setMessage(map.title + ': В разработке');
        return;
      }

      this.currentMapId = map.id;
      this.setMessage('Выбрана карта: ' + map.title);
      this.close();

      if (this.callbacks.onSelectImplemented) {
        this.callbacks.onSelectImplemented(map);
      }
    }

    render() {
      if (!this.elements.mapItems) return;

      this.elements.mapItems.innerHTML = MAPS.map((map) => {
        const selected = map.id === this.currentMapId;
        const classes = 'map-choice' + (selected ? ' map-choice-selected' : '') + (!map.implemented ? ' map-choice-disabled' : '');
        return '<button class="' + classes + '" type="button" data-map-id="' + map.id + '" title="' + map.description + '">'
          + '<strong>' + map.title + '</strong>'
          + '<em>' + map.status + '</em>'
          + '</button>';
      }).join('');
    }

    setMessage(message) {
      if (this.elements.mapMessage) {
        this.elements.mapMessage.textContent = message || '';
      }
    }

    getCurrentMap() {
      return MAPS.find((entry) => entry.id === this.currentMapId);
    }

    static get maps() {
      return MAPS.slice();
    }
  }

  window.MapSelectionSystem = MapSelectionSystem;
})();
