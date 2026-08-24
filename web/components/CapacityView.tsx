'use client';

export type CapacityStop = {
  id?: number;
  stop_order: number;
  stop_type: 'pickup' | 'delivery';
  address: string;
  member_name?: string | null;
  weight_kg?: number | null;
  own_unload_kg?: number | null;
  load_after_kg?: number | null;
  own_load_kg?: number | null;
  request_load_kg?: number | null;
  util_pct?: number | null;
  over_capacity?: boolean;
};

export type CapacitySchedule = {
  capacity_kg?: number | null;
  initial_load_kg?: number | null;
  initial_util_pct?: number | null;
  peak_load_kg?: number | null;
  peak_util_pct?: number | null;
  over_capacity?: boolean;
  stops?: CapacityStop[];
};

const barColor = (pct: number | null | undefined) => {
  if (pct == null) return '#bdc3c7';
  if (pct < 70) return '#27ae60';
  if (pct < 90) return '#e67e22';
  return '#c0392b';
};
const roomLabel = (pct: number | null | undefined) => {
  if (pct == null) return '';
  if (pct < 70) return '余裕';
  if (pct < 90) return 'やや混雑';
  return 'ひっ迫';
};

function Bar({ pct }: { pct: number | null | undefined }) {
  const w = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  return (
    <div style={{ background: '#eef2f4', borderRadius: 4, height: 10, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${w}%`, height: '100%', background: barColor(pct) }} />
    </div>
  );
}

export default function CapacityView({ schedule }: { schedule: CapacitySchedule }) {
  const cap = schedule.capacity_kg;
  const stops = schedule.stops || [];

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        トラック容量: <b>{cap != null ? `${cap}kg` : '未設定'}</b>
        {' / '}出発時の積載: <b>{schedule.initial_load_kg ?? 0}kg</b>
        {schedule.initial_util_pct != null && (
          <span style={{ color: barColor(schedule.initial_util_pct), fontWeight: 'bold' }}>
            {' '}（{schedule.initial_util_pct}% 使用・{roomLabel(schedule.initial_util_pct)}）
          </span>
        )}
        <div style={{ marginTop: 4 }}>
          最大積載（自社＋依頼の合計ピーク）: <b>{schedule.peak_load_kg ?? 0}kg</b>
          {schedule.peak_util_pct != null && (
            <span style={{ color: barColor(schedule.peak_util_pct), fontWeight: 'bold' }}>
              {' '}（{schedule.peak_util_pct}%・{roomLabel(schedule.peak_util_pct)}）
            </span>
          )}
        </div>
        {schedule.over_capacity && (
          <div style={{ marginTop: 4, color: '#fff', background: '#c0392b', padding: '4px 8px', borderRadius: 4, fontWeight: 'bold' }}>
            ⚠️ 容量を超過しています。依頼の見直しか容量の調整が必要です。
          </div>
        )}
      </div>

      {/* 出発時 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ width: 90, fontSize: 12, color: '#7a8a99' }}>🏁 出発時</span>
        <Bar pct={schedule.initial_util_pct} />
        <span style={{ width: 130, fontSize: 12, textAlign: 'right' }}>
          {schedule.initial_load_kg ?? 0}{cap != null ? `/${cap}` : ''}kg
          {schedule.initial_util_pct != null ? ` (${schedule.initial_util_pct}%)` : ''}
        </span>
      </div>

      {stops.map((s, i) => (
        <div key={s.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span title={s.member_name || s.address}
                style={{ width: 140, fontSize: 12, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {s.stop_type === 'pickup' ? '🟠' : '🟢'} {s.member_name || s.address || `地点${s.stop_order}`}
            {s.own_unload_kg ? <span style={{ color: '#2980b9' }}>（自社-{s.own_unload_kg}kg）</span> : null}
          </span>
          <Bar pct={s.util_pct} />
          <span style={{ width: 190, fontSize: 12, textAlign: 'right' }}>
            <span title="自社＋依頼の合計">
              {s.load_after_kg ?? 0}{cap != null ? `/${cap}` : ''}kg
            </span>
            <span style={{ color: '#7a8a99' }}>
              {' '}（自社{s.own_load_kg ?? 0}＋依頼{s.request_load_kg ?? 0}）
            </span>
            {s.util_pct != null ? ` ${s.util_pct}%` : ''}
            {s.over_capacity ? <span style={{ color: '#c0392b', fontWeight: 'bold' }}> ⚠超過</span> : null}
          </span>
        </div>
      ))}
      {cap == null && (
        <p style={{ fontSize: 11, color: '#7a8a99', marginTop: 4 }}>
          ※ 容量が未設定のため%は表示されません。予定作成時に容量を入力すると余裕度が表示されます。
        </p>
      )}
    </div>
  );
}
