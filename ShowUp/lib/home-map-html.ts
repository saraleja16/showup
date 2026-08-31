import { MAP_STYLE_URL, type HomeMapMarker } from './home-map-data';
import type { LatLng } from './map-location';

type MapHtmlPayload = {
  center: LatLng;
  events: HomeMapMarker[];
  venues: HomeMapMarker[];
};

export function buildHomeMapHtml({ center, events, venues }: MapHtmlPayload): string {
  const payload = JSON.stringify({ center, events, venues, style: MAP_STYLE_URL });
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #111827; }
    .maplibregl-ctrl-attrib { font-size: 9px; opacity: 0.7; }
    .maplibregl-ctrl-attrib a { color: #9ca3af; }
    .user-dot {
      width: 14px; height: 14px; border-radius: 50%;
      background: #a8ff3e;
      border: 2px solid #1a1a2e;
      box-shadow: 0 0 0 4px rgba(168,255,62,0.25);
    }
    .event-pin {
      width: 36px; height: 36px; border-radius: 50%;
      background: #0b1220; border: 1.5px solid rgba(168,255,62,0.7);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; cursor: pointer;
      box-shadow: 0 0 10px rgba(168,255,62,0.35);
    }
    .venue-pin {
      width: 32px; height: 32px; border-radius: 50%;
      background: #0b1220; border: 1.5px solid rgba(96,165,250,0.75);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; cursor: pointer;
      box-shadow: 0 0 8px rgba(96,165,250,0.35);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const DATA = ${payload};
    const map = new maplibregl.Map({
      container: 'map',
      style: DATA.style,
      center: [DATA.center.lng, DATA.center.lat],
      zoom: 12,
      attributionControl: true,
      interactive: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.scrollZoom.disable();
    map.touchZoomRotate.enable();
    map.dragPan.enable();

    const userEl = document.createElement('div');
    userEl.className = 'user-dot';
    new maplibregl.Marker({ element: userEl })
      .setLngLat([DATA.center.lng, DATA.center.lat])
      .addTo(map);

    function addMarker(item, className) {
      const el = document.createElement('button');
      el.className = className;
      el.type = 'button';
      el.textContent = item.emoji;
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'select', marker: item }));
      });
      new maplibregl.Marker({ element: el })
        .setLngLat([item.lng, item.lat])
        .addTo(map);
    }

    map.on('load', function() {
      DATA.events.forEach(function(e) { addMarker(e, 'event-pin'); });
      DATA.venues.forEach(function(v) { addMarker(v, 'venue-pin'); });
      map.resize();
    });
  </script>
</body>
</html>`;
}
