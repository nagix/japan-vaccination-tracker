const svg = document.getElementById('info');
const map = L.map('map', {center: [36, 136], zoom: svg.clientWidth < 600 ? 5 : 6});
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
    const x1 = x - min.x;
    const y1 = y - min.y;
    const factor = Math.pow(2, map.getZoom() - 6);
    const lx = item.lx * factor;
    const ly = item.ly * factor;
    const lw = (lx < 0 ? -200 : 200) * factor;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttributeNS(null, 'd', `M${x1},${y1}l${lx},${ly}l${lw},0`);
    line.setAttributeNS(null, 'stroke', '#999');
    line.setAttributeNS(null, 'fill', 'transparent');
    lines.append(line);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'g');
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
    count.textContent = dict[String(item.pref).padStart(2, '0')].count[0].toLocaleString();
    label.append(count);
    label.setAttributeNS(null, 'transform', `translate(${x1 + lx + (lx >= 0 ? 180 * factor - label.getBBox().width : -200 * factor)} ${y1 + ly})`);
  }
}

Promise.all([
  'prefectures.geojson',
  'prefectures.json',
  'https://nagi-p.com/vaccination/prefecture.json'
].map(loadJSON)).then(([geojson, data, vaccination]) => {
  const frontera = L.geoJson(geojson, {
    style: {color: '#00f', weight: 2, opacity: 0.6, fillOpacity: 0.1, fillColor: '#00f'},
    onEachFeature: function (feat, layer) {
      // layer.bindPopup(`${feat.properties.pref} ${feat.properties.name}`);
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
  for (const item of vaccination) {
    if (!dict[item.prefecture]) {
      dict[item.prefecture] = {count: [0, 0], daily: {}};
    }
    dict[item.prefecture].count[item.status - 1] += item.count;
    if (!dict[item.prefecture].daily[item.date]) {
      dict[item.prefecture].daily[item.date] = [0, 0];
    }
    dict[item.prefecture].daily[item.date][item.status - 1] += item.count;
  }
  const dates = Object.keys(dict).sort().reverse();

  refreshLines(data, dict);
});
