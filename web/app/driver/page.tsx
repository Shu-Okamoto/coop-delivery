'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { apiPostForm, apiPost, driverGet, checkDriverPin, statusLabel, statusColor } from '@/lib/api';
import type { Route, RouteStop } from '@/lib/types';

const GPS_INTERVAL = 30_000; // 30秒ごとに位置送信

type DriverInfo = { id: number; name: string; phone: string };

export default function DriverPage() {
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // ログイン後の状態
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [detail, setDetail] = useState<Route | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [uploading, setUploading] = useState<number | null>(null);
  const [gpsOn, setGpsOn] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const watchId = useRef<number | null>(null);
  const gpsTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCoords = useRef<{ lat: number; lng: number; heading?: number; speed?: number } | null>(null);

  // localStorage からドライバー情報を復元
  useEffect(() => {
    const saved = localStorage.getItem('coop_driver');
    if (saved) {
      try { setDriver(JSON.parse(saved)); } catch {}
    }
  }, []);

  // PIN認証
  const login = async () => {
    setPinError(null);
    const d = await checkDriverPin(pin);
    if (d) {
      setDriver(d);
      localStorage.setItem('coop_driver', JSON.stringify(d));
    } else {
      setPinError('PINが違います');
    }
  };

  const logout = () => {
    stopGps();
    localStorage.removeItem('coop_driver');
    localStorage.removeItem('coop_driver_pin');
    setDriver(null);
    setDetail(null);
    setSelectedId('');
  };

  // 本日のルート一覧 (ドライバー専用APIで自分担当のみ取得)
  const loadRoutes = useCallback(async () => {
    if (!driver) return;
    try {
      const mine = await driverGet<Route[]>('/api/driver/routes');
      setRoutes(mine.filter((r) => r.status !== 'cancelled'));
    } catch {
      setRoutes([]);
    }
  }, [driver]);

  useEffect(() => { loadRoutes(); }, [loadRoutes]);

  const loadDetail = async () => {
    if (!selectedId) return;
    try {
      const d = await driverGet<Route>(`/api/driver/routes/${selectedId}`);
      setDetail(d);
    } catch (e: any) {
      alert('読み込み失敗: ' + e.message);
    }
  };

  // ===== GPS送信 =====
  const sendPosition = useCallback(async () => {
    if (!detail || !lastCoords.current) return;
    try {
      await apiPost('/api/positions', {
        route_id: detail.id,
        vehicle_id: detail.vehicle_id || null,
        driver_id: driver?.id || null,
        lat: lastCoords.current.lat,
        lng: lastCoords.current.lng,
        heading: lastCoords.current.heading,
        speed_kmh: lastCoords.current.speed,
      });
    } catch {
      // 送信失敗は次周期でリトライ
    }
  }, [detail, driver]);

  const startGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('この端末は位置情報に対応していません');
      return;
    }
    setGpsError(null);
    // 位置を継続監視して最新座標を保持
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastCoords.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined, // m/s → km/h
        };
        setGpsOn(true);
      },
      (err) => {
        setGpsError('位置情報の取得に失敗: ' + err.message);
        setGpsOn(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
    // 30秒ごとにサーバーへ送信
    sendPosition();
    gpsTimer.current = setInterval(sendPosition, GPS_INTERVAL);
  }, [sendPosition]);

  const stopGps = () => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (gpsTimer.current) {
      clearInterval(gpsTimer.current);
      gpsTimer.current = null;
    }
    setGpsOn(false);
  };

  // ルート切替時はGPSを止める
  useEffect(() => {
    return () => stopGps();
  }, []);

  // ===== ストップ完了 (写真任意) =====
  const completeStop = async (stop: RouteStop) => {
    if (!stop.id) return;
    if (!confirm(`「${stop.member_name || stop.address}」を完了にしますか？`)) return;
    setUploading(stop.id);
    try {
      const form = new FormData();
      const note = notes[stop.id] || '';
      if (note) form.append('notes', note);
      const fileInput = fileInputs.current[stop.id];
      if (fileInput?.files?.[0]) {
        form.append('photo', fileInput.files[0]);
      }
      await apiPostForm(`/api/stops/${stop.id}/complete`, form);
      await loadDetail();
    } catch (e: any) {
      alert('完了処理に失敗: ' + e.message);
    } finally {
      setUploading(null);
    }
  };

  // ===== ログイン画面 =====
  if (!driver) {
    return (
      <div className="driver-body">
        <header className="header">
          <h1>🚚 ドライバー画面</h1>
        </header>
        <div style={{ maxWidth: 360, margin: '40px auto', padding: '0 16px' }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>PINでログイン</h2>
            <p style={{ fontSize: 13, color: '#7a8a99' }}>
              管理者から伝えられた4桁のPINを入力してください
            </p>
            <input
              type="tel"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              placeholder="0000"
              maxLength={6}
              style={{
                width: '100%', padding: 12, fontSize: 24, textAlign: 'center',
                letterSpacing: 8, border: '1px solid #d5dbdb', borderRadius: 6, marginBottom: 8,
              }}
            />
            {pinError && <p style={{ color: 'crimson', fontSize: 13 }}>{pinError}</p>}
            <button className="btn" style={{ width: '100%' }} onClick={login}>ログイン</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== メイン画面 =====
  const completed = detail?.stops?.filter((s) => s.completed).length || 0;
  const total = detail?.stops?.length || 0;
  const pct = total ? (completed / total) * 100 : 0;
  const currentIdx = detail?.stops?.findIndex((s) => !s.completed) ?? -1;

  return (
    <div className="driver-body">
      <header className="header">
        <h1>🚚 ドライバー画面</h1>
        <nav className="nav">
          <span style={{ fontSize: 14 }}>👤 {driver.name}</span>
          <span className="spacer" />
          <span className={`gps-indicator ${gpsOn ? 'gps-on' : 'gps-off'}`}>
            {gpsOn ? '📡 GPS送信中' : '⏸ GPS停止'}
          </span>
          <button onClick={logout}>ログアウト</button>
        </nav>
      </header>

      <main className="driver-main">
        {/* ルート選択 */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>本日の担当ルート</h3>
          {routes.length === 0 && (
            <p style={{ fontSize: 13, color: '#7a8a99' }}>
              本日あなた担当のルートはありません。
            </p>
          )}
          {routes.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{ flex: 1, padding: 10, borderRadius: 4, border: '1px solid #d5dbdb', fontSize: 15 }}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value ? +e.target.value : '')}
              >
                <option value="">ルートを選択...</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} [{statusLabel(r.status)}]
                  </option>
                ))}
              </select>
              <button className="btn" onClick={loadDetail}>表示</button>
            </div>
          )}
        </div>

        {gpsError && <div className="error-box">{gpsError}</div>}

        {detail && (
          <>
            {/* ルート概要 + GPS制御 */}
            <div className="card">
              <h3 style={{ marginTop: 0 }}>
                {detail.name}{' '}
                <span className="badge" style={{ background: statusColor(detail.status) }}>
                  {statusLabel(detail.status)}
                </span>
              </h3>
              <div style={{ fontSize: 13, color: '#7a8a99' }}>
                車両: {detail.vehicle_name || '—'}
                {detail.vehicle_plate && ` (${detail.vehicle_plate})`}<br />
                進捗: {completed} / {total} 完了
              </div>
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                {!gpsOn ? (
                  <button className="btn" onClick={startGps}>📡 GPS送信を開始</button>
                ) : (
                  <button className="btn danger" onClick={stopGps}>⏸ GPS送信を停止</button>
                )}
              </div>
              <p style={{ fontSize: 11, color: '#95a5a6', marginTop: 8 }}>
                ※ GPS送信中は30秒ごとに現在地が組合員の地図に反映されます
              </p>
            </div>

            {/* 経由地カード */}
            {detail.stops?.map((s, i) => {
              const isCurrent = i === currentIdx;
              const cls = ['stop-card', s.stop_type, s.completed ? 'completed' : '', isCurrent ? 'current' : '']
                .filter(Boolean).join(' ');
              const typeLabel = s.stop_type === 'pickup' ? '集荷' : '配達';

              return (
                <div className={cls} key={s.id}>
                  <div className="stop-header">
                    <div className="stop-num-big">{s.stop_order}</div>
                    <div style={{
                      fontWeight: 'bold', fontSize: 16,
                      color: s.stop_type === 'pickup' ? '#e67e22' : '#27ae60',
                    }}>
                      {s.stop_type === 'pickup' ? '🟠' : '🟢'} {typeLabel}先
                    </div>
                    {s.completed && (
                      <span style={{
                        marginLeft: 'auto', background: '#27ae60', color: '#fff',
                        padding: '4px 12px', borderRadius: 12, fontSize: 12,
                      }}>✓ 完了</span>
                    )}
                  </div>

                  <div style={{ fontSize: 14 }}>
                    <div style={{ color: '#7a8a99', fontSize: 12 }}>場所</div>
                    <div><strong>{s.member_name || '—'}</strong></div>
                    <div>{s.address}</div>
                    {s.lat && s.lng && (
                      <a className="tel-link" target="_blank" rel="noopener noreferrer"
                         href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}>
                        📍 地図を開く
                      </a>
                    )}
                    <div className="cargo-info">
                      📦 {s.cargo_description || '—'}
                      {s.weight_kg ? ` (${s.weight_kg}kg)` : ''}
                      {s.refrigerated && <span style={{ color: '#2980b9', fontWeight: 'bold' }}> ❄️ 要冷蔵</span>}
                      {s.scheduled_time && <div>予定時刻: {s.scheduled_time}</div>}
                    </div>

                    {/* 完了済み: 記録を表示 */}
                    {s.completed && (
                      <div style={{ marginTop: 8, fontSize: 13 }}>
                        {s.completed_at && (
                          <div style={{ color: '#7a8a99' }}>
                            完了時刻: {new Date(s.completed_at).toLocaleString('ja-JP')}
                          </div>
                        )}
                        {s.notes && <div>メモ: {s.notes}</div>}
                        {s.photo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.photo_url} alt="完了写真" className="photo-thumb" />
                        )}
                      </div>
                    )}

                    {/* 未完了: 記録入力フォーム */}
                    {!s.completed && (
                      <>
                        <input
                          className="notes-input"
                          placeholder="配達メモ (受け取り者名など・任意)"
                          value={notes[s.id!] || ''}
                          onChange={(e) => setNotes({ ...notes, [s.id!]: e.target.value })}
                        />
                        <input
                          className="file-input"
                          type="file"
                          accept="image/*"
                          capture="environment"
                          ref={(el) => { fileInputs.current[s.id!] = el; }}
                        />
                        <button
                          className="complete-btn"
                          disabled={!isCurrent || uploading === s.id}
                          onClick={() => completeStop(s)}
                        >
                          {uploading === s.id
                            ? 'アップロード中...'
                            : isCurrent
                              ? `この${typeLabel}を完了して記録`
                              : '前の地点を完了させてください'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/" style={{ color: '#7a8a99', fontSize: 13 }}>← トップに戻る</Link>
        </div>
      </main>
    </div>
  );
}
