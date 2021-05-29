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

function refreshLines(data, dict) {
  const {min} = map.getPixelBounds();
  let lines = document.getElementById('pref-lines');
  if (lines) {
    lines.remove();
  }
  lines = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  lines.setAttributeNS(null, 'id', 'pref-lines');
  svg.append(lines);

  for (const item of data) {
    const {x, y} = map.project(item);
    const lx = x - min.x;
    const ly = y - min.y;
    const factor = Math.pow(2, map.getZoom() - 6);
    const dx = item.ll * Math.sin(item.lr * Math.PI / 180) * factor;
    const dy = -item.ll * Math.cos(item.lr * Math.PI / 180) * factor;
    const w = (dx < 0 ? -200 : 200) * factor;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttributeNS(null, 'd', `M${lx},${ly}l${dx},${dy}l${w},0`);
    line.setAttributeNS(null, 'stroke', '#999');
    line.setAttributeNS(null, 'fill', 'transparent');
    lines.append(line);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    label.id = `label-${item.prefecture}`;
    lines.append(label);
    const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    name.setAttributeNS(null, 'x', 10 * factor);
    name.setAttributeNS(null, 'y', -3 * factor);
    name.setAttributeNS(null, 'font-size', 14 * factor);
    name.setAttributeNS(null, 'class', 'prefecture-name');
    name.textContent = item.name;
    label.append(name);
    const count = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    count.setAttributeNS(null, 'x', 20 * factor + name.getBBox().width);
    count.setAttributeNS(null, 'y', -3 * factor);
    count.setAttributeNS(null, 'font-size', 21 * factor);
    count.setAttributeNS(null, 'class', 'prefecture-count');
    count.textContent = dict[item.prefecture].count[0].toLocaleString();
    label.append(count);
    label.setAttributeNS(null, 'transform', `translate(${lx + dx + (dx < 0 ? -200 * factor : 180 * factor - label.getBBox().width)} ${ly + dy})`);
  }
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

  map.on('move', () => {
    refreshLines(data, dict);
  });
  map.on('zoomstart', () => {
    svg.style.visibility = 'hidden';
  });
  map.on('zoomend', () => {
    svg.style.visibility = 'visible';
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
  for (const key of Object.keys(dict)) {
    const item = dict[key];
    item.count = [...item.base];
    for (const date of week) {
      if (item.daily[date]) {
        item.rate[0] += item.daily[date][0] / 7;
        item.rate[1] += item.daily[date][1] / 7;
      }
    }
    frontera.eachLayer(layer => {
      if (layer.feature.properties.prefecture === key) {
        item.layers.push(layer);
      }
    });
  }

  refreshLines(data, dict);

  (function frameRefresh() {
    const localTime = luxon.DateTime.fromObject({zone: 'Asia/Tokyo'});
    const millis = Date.now() - localTime.startOf('day').toMillis();
    for (const key of Object.keys(dict)) {
      const item = dict[key];
      const estimate = Math.floor(item.base[0] + item.rate[0] * millis / 86400000);
      if (item.count[0] < estimate) {
        item.count[0] = estimate;
        const count = svg.querySelector(`#label-${key} text:last-child`);
        count.textContent = estimate.toLocaleString();
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
      time.textContent = localTime.toFormat('yyyy年M月d日 HH:mm:ss');
      lastTimeUpdate = Date.now() % 1000 * 1000;
    }
    window.requestAnimationFrame(frameRefresh);
  })();
});
