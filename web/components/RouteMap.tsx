'use client';
import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, STOP_COLORS, DEFAULT_CENTER, DEFAULT_ZOOM } from '@/lib/maps';
import type { RouteStop, RoutePositionMarker } from '@/lib/types';

type Props = {
  // 単一ルートの経由地表示モード
  stops?: RouteStop[];
  // 複数車両の現在地表示モード
  vehicles?: RoutePositionMarker[];
  // 単一ルートの車両現在地 (1台)
  vehiclePosition?: { lat: number; lng: number } | null;
  // 経路線を引くか (Directions API 使用)
  drawDirections?: boolean;
  height?: string;
  onVehicleClick?: (routeId: number) => void;
};

export default function RouteMap({
  stops = [],
  vehicles = [],
  vehiclePosition = null,
  drawDirections = false,
  height = '480px',
  onVehicleClick,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const directionsRenderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // 地図初期化
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapRef.current) return;
        mapObj.current = new google.maps.Map(mapRef.current, {
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        directionsRenderer.current = new google.maps.DirectionsRenderer({
          map: mapObj.current,
          suppressMarkers: true,
          polylineOptions: { strokeColor: '#2c5f2d', strokeWeight: 4, strokeOpacity: 0.8 },
        });
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, []);

  // マーカー・ルート線を再描画
  useEffect(() => {
    if (!ready || !mapObj.current) return;
    const map = mapObj.current;

    // 既存マーカー削除
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

    const bounds = new google.maps.LatLngBounds();
    let hasPoint = false;

    // --- 経由地マーカー ---
    stops.forEach((s) => {
      const pos = { lat: Number(s.lat), lng: Number(s.lng) };
      const marker = new google.maps.Marker({
        position: pos,
        map,
        label: {
          text: String(s.stop_order),
          color: '#fff',
          fontWeight: 'bold',
          fontSize: '13px',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: s.completed ? '#7f8c8d' : STOP_COLORS[s.stop_type],
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        title: `${s.stop_order}. ${s.stop_type === 'pickup' ? '集荷' : '配達'} — ${s.member_name || s.address}`,
      });
      const info = new google.maps.InfoWindow({
        content: `
          <div style="font-size:13px;line-height:1.5;max-width:220px">
            <strong>${s.stop_order}. ${s.stop_type === 'pickup' ? '🟠 集荷' : '🟢 配達'}</strong><br>
            ${s.member_name ? `<b>${s.member_name}</b><br>` : ''}
            ${s.address}<br>
            ${s.cargo_description ? `📦 ${s.cargo_description}<br>` : ''}
            ${s.weight_kg ? `${s.weight_kg}kg ` : ''}${s.refrigerated ? '❄️冷蔵' : ''}<br>
            ${s.scheduled_time ? `予定 ${s.scheduled_time}<br>` : ''}
            ${s.completed ? '<span style="color:#27ae60">✅ 完了</span>' : ''}
          </div>`,
      });
      marker.addListener('click', () => info.open(map, marker));
      markersRef.current.push(marker);
      bounds.extend(pos);
      hasPoint = true;
    });

    // --- 経路線 (Directions API or 直線ポリライン) ---
    if (stops.length >= 2) {
      if (drawDirections) {
        const ds = new google.maps.DirectionsService();
        const waypoints = stops.slice(1, -1).map((s) => ({
          location: { lat: Number(s.lat), lng: Number(s.lng) },
          stopover: true,
        }));
        ds.route(
          {
            origin: { lat: Number(stops[0].lat), lng: Number(stops[0].lng) },
            destination: {
              lat: Number(stops[stops.length - 1].lat),
              lng: Number(stops[stops.length - 1].lng),
            },
            waypoints,
            travelMode: google.maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === 'OK' && result && directionsRenderer.current) {
              directionsRenderer.current.setDirections(result);
            } else {
              // Directions失敗時は直線で代替
              drawStraightLine();
            }
          }
        );
      } else {
        drawStraightLine();
      }
    }

    function drawStraightLine() {
      polylineRef.current = new google.maps.Polyline({
        path: stops.map((s) => ({ lat: Number(s.lat), lng: Number(s.lng) })),
        strokeColor: '#2c5f2d',
        strokeWeight: 3,
        strokeOpacity: 0.6,
        map,
      });
    }

    // --- 複数車両の現在地マーカー ---
    vehicles.forEach((v) => {
      if (v.lat == null || v.lng == null) return;
      const pos = { lat: Number(v.lat), lng: Number(v.lng) };
      const marker = new google.maps.Marker({
        position: pos,
        map,
        icon: {
          path: 'M -2,-2 2,-2 2,2 -2,2 z', // 四角 (トラックの簡易表現)
          scale: 6,
          fillColor: v.status === 'in_progress' ? '#3498db' : '#95a5a6',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        title: `${v.route_name} (${v.driver_name || '—'})`,
        zIndex: 999,
      });
      const info = new google.maps.InfoWindow({
        content: `
          <div style="font-size:13px;line-height:1.5">
            <strong>🚚 ${v.route_name}</strong><br>
            ドライバー: ${v.driver_name || '—'}<br>
            車両: ${v.vehicle_name || '—'}<br>
            ${v.recorded_at ? `更新: ${new Date(v.recorded_at).toLocaleTimeString('ja-JP')}` : ''}
          </div>`,
      });
      marker.addListener('click', () => {
        info.open(map, marker);
        if (onVehicleClick) onVehicleClick(v.route_id);
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      hasPoint = true;
    });

    // --- 単一ルートの車両現在地 ---
    if (vehiclePosition) {
      const pos = { lat: Number(vehiclePosition.lat), lng: Number(vehiclePosition.lng) };
      const marker = new google.maps.Marker({
        position: pos,
        map,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: '#3498db',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        title: '🚚 現在地',
        zIndex: 999,
      });
      markersRef.current.push(marker);
      bounds.extend(pos);
      hasPoint = true;
    }

    // 全マーカーが収まるように調整
    if (hasPoint) {
      map.fitBounds(bounds);
      // 1点だけのときズームしすぎ防止
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() || 0) > 15) map.setZoom(15);
      });
    }
  }, [ready, stops, vehicles, vehiclePosition, drawDirections, onVehicleClick]);

  if (error) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fdf0ed', color: '#c0392b', borderRadius: 8, padding: 16, textAlign: 'center',
      }}>
        地図の読み込みに失敗しました: {error}<br />
        <small>環境変数 NEXT_PUBLIC_GOOGLE_MAPS_KEY を確認してください</small>
      </div>
    );
  }

  return <div ref={mapRef} style={{ width: '100%', height, borderRadius: 8 }} />;
}
