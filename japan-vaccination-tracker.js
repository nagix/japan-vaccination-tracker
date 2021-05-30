const SVG_NS = 'http://www.w3.org/2000/svg';

let lastTimeUpdate = 0;
const time = document.getElementById('time');
const svg = document.getElementById('info');
const map = L.map('map', {center: [36, 136], zoom: svg.clientWidth < 600 ? 5 : 6});
const att = '<a href="https://cio.go.jp/c19vaccine_opendata" target="_blank">政府CIOポータル</a> | <a href="https://github.com/nagix/japan-vaccination-tracker">&copy; Akihiko Kusanagi</a>';
map.zoomControl.setPosition('topright');
L.control.scale({imperial: false}).addTo(map);

function loadJSON(url) {
  return fetch(url).then(async response => response.json());
}

function getLocalTime() {
  return luxon.DateTime.fromObject({zone: 'Asia/Tokyo'});
}

function getMillisOfDay() {
  const localTime = luxon.DateTime.fromObject({zone: 'Asia/Tokyo'});
  return Date.now() - getLocalTime().startOf('day').toMillis();
}

Promise.all([
  'prefectures.geojson',
  'prefectures.json',
  'https://nagi-p.com/vaccination/prefecture.json'
].map(loadJSON)).then(([geojson, data, vaccination]) => {
  const frontera = L.geoJson(geojson, {
    attribution: att,
    style: {color: '#00f', weight: 2, opacity: 0.6, fillOpacity: 0.1, fillColor: '#00f'},
    onEachFeature: function (feat, layer) {
      // layer.bindPopup(`${feat.properties.prefecture} ${feat.properties.name}`);
      layer.on({
        mouseover: e => {
          e.target.setStyle({color: '#f00', fillColor: '#f00'});
        },
        mouseout: e => {
          frontera.resetStyle(e.target);
        }
      });
    }
  }).addTo(map);

  map.on('zoomstart', () => {
    document.querySelectorAll('.label').forEach(element => {
      element.style.visibility = 'hidden';
    });
  });
  map.on('zoomend', () => {
    document.querySelectorAll('.label').forEach(element => {
      const factor = Math.pow(2, map.getZoom() - 6);
      element.style.padding = `0 ${10 * factor}px`;
      element.style.width = `${200 * factor}px`;
      element.style.height = `${22 * factor}px`;
      element.style.fontSize = `${14 * factor}px`;
      element.style.visibility = 'visible';
    });
  });

  const dict = {};
  const dates = {};
  for (const item of vaccination) {
    if (!dict[item.prefecture]) {
      dict[item.prefecture] = {base: [0, 0], rate: [0, 0], daily: {}, layers: [], flash: 0};
    }
    dict[item.prefecture].base[item.status - 1] += item.count;
    if (!dict[item.prefecture].daily[item.date]) {
      dict[item.prefecture].daily[item.date] = [0, 0];
    }
    dict[item.prefecture].daily[item.date][item.status - 1] += item.count;
    dates[item.date] = true;
  }

  const week = Object.keys(dates).sort().slice(-7);
  const millis = getMillisOfDay();
  for (const key of Object.keys(dict)) {
    const item = dict[key];
    for (const date of week) {
      if (item.daily[date]) {
        item.rate[0] += item.daily[date][0] / 7;
        item.rate[1] += item.daily[date][1] / 7;
      }
    }
    item.count = [
      Math.floor(item.base[0] + item.rate[0] * millis / 86400000),
      Math.floor(item.base[1] + item.rate[1] * millis / 86400000)
    ];
    frontera.eachLayer(layer => {
      if (layer.feature.properties.prefecture === key) {
        item.layers.push(layer);
      }
    });
  }

  for (const item of data) {
    const {lng, lat, lr, ll} = item
    const {x: x1, y: y1} = map.project(item);
    const factor = Math.pow(2, map.getZoom() - 6);
    const x2 = x1 + ll * Math.sin(lr * Math.PI / 180) * factor;
    const y2 = y1 - ll * Math.cos(lr * Math.PI / 180) * factor;
    const anchor = map.unproject([x2, y2]);
    const anchorEnd = map.unproject([x2 + (lr < 0 ? -200 : 200) * factor, y2]);

    const leader = L.geoJson(turf.lineString([[lng, lat], [anchor.lng, anchor.lat], [anchorEnd.lng, anchorEnd.lat]]), {
      style: {color: '#999', weight: 1, fillColor: 'transparent'}
    }).addTo(map);

    const icon = L.divIcon({
      className: 'label-container',
      iconSize: [0, 0],
      html: [
        `<div id="label-${item.prefecture}" class="label ${item.lr < 0 ? 'left' : 'right'}">`,
        `<span class="prefecture-name">${item.name}</span>`,
        `<span class="prefecture-count odometer">${dict[item.prefecture].count[0]}</span>`,
        '</div>'
      ].join('')});
    const marker = L.marker([anchor.lat, anchor.lng], {icon}).addTo(map);
    const element = document.querySelector(`#label-${item.prefecture}`);
    element.style.padding = `0 ${10 * factor}px`;
    element.style.width = `${200 * factor}px`;
    element.style.height = `${22 * factor}px`;
    element.style.fontSize = `${14 * factor}px`;
    const od = new Odometer({
      el: document.querySelector(`#label-${item.prefecture} .odometer`),
      value: dict[item.prefecture].count[0]
    });
  }

  (function frameRefresh() {
    const millis = getMillisOfDay();
    for (const key of Object.keys(dict)) {
      const item = dict[key];
      const estimate = Math.floor(item.base[0] + item.rate[0] * millis / 86400000);
      if (item.count[0] < estimate) {
        item.count[0] = estimate;
        const count = document.querySelector(`#label-${key} .prefecture-count`);
        count.innerText = estimate;
        item.flash = 61;
      }
      if (item.flash > 0) {
        item.flash--;
        if (item.flash % 10 === 0) {
          for (const layer of item.layers) {
            layer.setStyle({fillOpacity: 0.1 + item.flash / 100});
          }
        }
      }
    }
    if (lastTimeUpdate !== Date.now() % 1000 * 1000) {
      time.textContent = getLocalTime().toFormat('yyyy年M月d日 HH:mm:ss');
      lastTimeUpdate = Date.now() % 1000 * 1000;
    }
    window.requestAnimationFrame(frameRefresh);
  })();

});
