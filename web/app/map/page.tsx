'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import RouteMap from '@/components/RouteMap';
import PasswordGate from '@/components/PasswordGate';
import { apiGet, statusLabel, statusColor } from '@/lib/api';
import type { Route, RoutePositionMarker } from '@/lib/types';

const POLL_INTERVAL = 30_000; // 30秒

function MapPageInner() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [positions, setPositions] = useState<RoutePositionMarker[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // 指定日のルート一覧を取得
  const loadRoutes = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Route[]>(`/api/routes?date=${d}`);
      setRoutes(data);
      setSelectedRoute(null);
    } catch (e: any) {
      setError(e.message === 'UNAUTHORIZED' ? '認証エラー' : e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 車両の最新位置をポーリング
  const loadPositions = useCallback(async (d: string) => {
    try {
      const data = await apiGet<RoutePositionMarker[]>(`/api/positions/latest?date=${d}`);
      setPositions(data);
      setLastUpdate(new Date());
    } catch {
      // ポーリング失敗は静かに無視 (次の周期で再試行)
    }
  }, []);

  useEffect(() => { loadRoutes(date); }, [date, loadRoutes]);

  // 30秒ごとに位置を更新
  useEffect(() => {
    loadPositions(date);
    const timer = setInterval(() => loadPositions(date), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [date, loadPositions]);

  // 選択ルートの詳細を取得
  const selectRoute = async (id: number) => {
    try {
      const detail = await apiGet<Route>(`/api/routes/${id}`);
      setSelectedRoute(detail);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // 地図に渡すデータ: ルート選択時はそのルートの経由地、未選択時は全車両の現在地
  const mapStops = selectedRoute?.stops || [];
  const mapVehicles = selectedRoute ? [] : positions.filter((p) => p.lat != null);
  const mapVehiclePosition = selectedRoute?.latest_position
    ? { lat: selectedRoute.latest_position.lat, lng: selectedRoute.latest_position.lng }
    : null;

  return (
    <>
      <header className="header">
        <h1>🗺️ 配送マップ</h1>
        <nav className="nav">
          <Link href="/map" className="active">配送マップ</Link>
          <Link href="/admin">管理画面</Link>
          <Link href="/driver">ドライバー</Link>
          <span className="spacer" />
          {lastUpdate && (
            <span className="gps-indicator">
              🔄 {lastUpdate.toLocaleTimeString('ja-JP')} 更新
            </span>
          )}
        </nav>
      </header>

      <div className="container">
        <div className="toolbar">
          <label>
            日付:{' '}
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="btn small" onClick={() => loadRoutes(date)}>再読込</button>
          {selectedRoute && (
            <button className="btn secondary small" onClick={() => setSelectedRoute(null)}>
              ← 全車両表示に戻る
            </button>
          )}
        </div>

        {error && <div className="error-box">{error}</div>}

        {/* 地図 */}
        <RouteMap
          stops={mapStops}
          vehicles={mapVehicles}
          vehiclePosition={mapVehiclePosition}
          drawDirections={!!selectedRoute}
          height="460px"
          onVehicleClick={(routeId) => selectRoute(routeId)}
        />

        {/* 選択中ルートの詳細 */}
        {selectedRoute && (
          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              {selectedRoute.name}{' '}
              <span className="badge" style={{ background: statusColor(selectedRoute.status) }}>
                {statusLabel(selectedRoute.status)}
              </span>
            </h3>
            <p style={{ fontSize: 13, color: '#7a8a99' }}>
              ドライバー: {selectedRoute.driver_name || '—'} / 車両: {selectedRoute.vehicle_name || '—'}
              {selectedRoute.planned_start_time && ` / 予定開始 ${selectedRoute.planned_start_time}`}
            </p>
            <table>
              <thead>
                <tr><th>#</th><th>種別</th><th>場所</th><th>荷物</th><th>予定</th><th>状態</th></tr>
              </thead>
              <tbody>
                {selectedRoute.stops?.map((s) => (
                  <tr key={s.id}>
                    <td>{s.stop_order}</td>
                    <td>{s.stop_type === 'pickup' ? '🟠 集荷' : '🟢 配達'}</td>
                    <td>{s.member_name || s.address}</td>
                    <td>
                      {s.cargo_description || '—'}
                      {s.weight_kg ? ` (${s.weight_kg}kg)` : ''}
                      {s.refrigerated ? ' ❄️' : ''}
                    </td>
                    <td>{s.scheduled_time || '—'}</td>
                    <td>
                      {s.completed
                        ? `✅ ${s.completed_at ? new Date(s.completed_at).toLocaleTimeString('ja-JP') : ''}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ルート一覧 */}
        {!selectedRoute && (
          <>
            <h2>{date} の予定ルート ({routes.length}件)</h2>
            {loading && <p>読込中...</p>}
            {!loading && routes.length === 0 && (
              <p className="empty">この日のルートはまだ登録されていません</p>
            )}
            {routes.map((r) => {
              const pos = positions.find((p) => p.route_id === r.id);
              return (
                <div
                  key={r.id}
                  className="route-item clickable"
                  onClick={() => selectRoute(r.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="info">
                    <div className="title">
                      {r.name}{' '}
                      <span className="badge" style={{ background: statusColor(r.status) }}>
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <div className="sub">
                      ドライバー: {r.driver_name || '—'} / 車両: {r.vehicle_name || '—'}
                      {r.planned_start_time && ` / 開始 ${r.planned_start_time}`}
                      {pos?.lat != null && pos.recorded_at && (
                        <> / 📍 {new Date(pos.recorded_at).toLocaleTimeString('ja-JP')} 時点</>
                      )}
                    </div>
                  </div>
                  <div className="actions">
                    <span className="btn small">地図で見る →</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}

export default function MapPage() {
  return (
    <PasswordGate role="viewer">
      <MapPageInner />
    </PasswordGate>
  );
}
