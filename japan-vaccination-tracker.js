import L from "https://code4sabae.github.io/leaflet-mjs/leaflet.mjs";
import { CSV } from "https://js.sabae.cc/CSV.js";
import * as luxon from "https://taisukef.github.io/luxon/src/luxon.js";

const SVG_NS = 'http://www.w3.org/2000/svg';

let lastTimeUpdate = 0;
const time = document.getElementById('time');
const svg = document.getElementById('info');
const map = L.map('map', {center: [36, 136], zoom: svg.clientWidth < 600 ? 5 : 6});
const att = '<a href="https://cio.go.jp/c19vaccine_opendata" target="_blank">政府CIOポータル</a> | <a href="https://github.com/nagix/japan-vaccination-tracker">&copy; Akihiko Kusanagi</a>';
map.zoomControl.setPosition('topright');
L.control.scale({imperial: false}).addTo(map);

const loadJSON = async (url) =>  await (await fetch(url)).json();
const loadCSV = async (url) => CSV.parse(await (await fetch(url)).text());

function refreshLines(data, dict) {
  const { min } = map.getPixelBounds();
  let lines = document.getElementById('pref-lines');
  if (lines) {
    lines.remove();
  }
  lines = document.createElementNS(SVG_NS, 'g');
  lines.setAttributeNS(null, 'id', 'pref-lines');
  svg.append(lines);

  for (const item of data) {
    const {x, y} = map.project(item);
    const lx = x - min.x;
    const ly = y - min.y;
    const factor = Math.pow(2, map.getZoom() - 6);
    const dx = item.ll * Math.sin(item.lr * Math.PI / 180);
    const dy = -item.ll * Math.cos(item.lr * Math.PI / 180);
    const w = dx < 0 ? -200 : 200;
    const leader = document.createElementNS(SVG_NS, 'g');
    leader.setAttributeNS(null, 'transform', `translate(${lx} ${ly}) scale(${factor})`);
    lines.append(leader);
    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttributeNS(null, 'd', `M0,0l${dx},${dy}l${w},0`);
    line.setAttributeNS(null, 'stroke', '#999');
    line.setAttributeNS(null, 'fill', 'transparent');
    leader.append(line);
    const label = document.createElementNS(SVG_NS, 'g');
    label.id = `label-${item.prefecture}`;
    leader.append(label);
    const name = document.createElementNS(SVG_NS, 'text');
    name.setAttributeNS(null, 'x', 10);
    name.setAttributeNS(null, 'y', -3);
    name.setAttributeNS(null, 'font-size', 14);
    name.setAttributeNS(null, 'class', 'prefecture-name');
    name.textContent = item.name;
    label.append(name);
    const count = document.createElementNS(SVG_NS, 'text');
    count.setAttributeNS(null, 'x', 20 + name.getBBox().width);
    count.setAttributeNS(null, 'y', -3);
    count.setAttributeNS(null, 'font-size', 21);
    count.setAttributeNS(null, 'class', 'prefecture-count');
    count.textContent = dict[item.prefecture].count[0].toLocaleString();
    label.append(count);
    label.setAttributeNS(null, 'transform', `translate(${dx + (dx < 0 ? -200 : 180 - label.getBBox().width)} ${dy})`);
  }
}

const [geojson, data, vaccination] = await Promise.all([
  loadJSON('https://taisukef.github.io/japan-vaccination-tracker/prefectures.geojson'), //'prefectures.geojson',
  loadJSON('https://taisukef.github.io/japan-vaccination-tracker/prefectures.json'), //loadJSON('https://nagi-p.com/vaccination/prefectures.json'),
  loadCSV('https://code4fukui.github.io/covid19vaccine/latest.csv'), //  'prefecture.json',
]);

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
  const cnt = parseInt(item.count);
  if (!dict[item.prefecture]) {
    dict[item.prefecture] = {base: [0, 0], rate: [0, 0], daily: {}, layers: [], flash: 0};
  }
  dict[item.prefecture].base[item.status - 1] += cnt;
  if (!dict[item.prefecture].daily[item.date]) {
    dict[item.prefecture].daily[item.date] = [0, 0];
  }
  dict[item.prefecture].daily[item.date][item.status - 1] += cnt;
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
