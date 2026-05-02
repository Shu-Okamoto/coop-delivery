-- ============================================================
-- サンプルデータ投入（山口県岩国市〜広島近郊）
-- 実行前に schema.sql を実行しておくこと
-- ============================================================

TRUNCATE TABLE cost_shares, route_stops, routes, delivery_requests, drivers, members RESTART IDENTITY CASCADE;

INSERT INTO members (code,name,type,address,lat,lng,contact_name,phone,email) VALUES
  ('M001','岩国八百屋本店','store','山口県岩国市麻里布町1-1-1',34.1664,132.2204,'田中太郎','0827-00-0001','iwakuni@example.com'),
  ('M002','岩国八百屋駅前店','store','山口県岩国市岩国2-2-2',34.1495,132.1799,'佐藤花子','0827-00-0002','eki@example.com'),
  ('M003','柳井青果卸','wholesaler','山口県柳井市柳井3-3-3',33.9633,132.1018,'鈴木一郎','0820-00-0003','yanai@example.com'),
  ('M004','周南農園','farmer','山口県周南市徳山4-4-4',34.0556,131.8060,'高橋次郎','0834-00-0004','farm@example.com'),
  ('M005','広島フルーツ商会','wholesaler','広島県大竹市本町5-5-5',34.2400,132.2200,'山田三郎','0827-00-0005','hf@example.com'),
  ('M006','玖珂直売所','farmer','山口県岩国市玖珂町6-6-6',34.1090,132.0570,'中村四郎','0827-00-0006','kuga@example.com'),
  ('M007','自社加工工場','manufacturer','山口県岩国市装束町7-7-7',34.1700,132.2300,'小林五郎','0827-00-0007','factory@example.com');

INSERT INTO drivers (member_id,name,phone,vehicle_type,vehicle_capacity_kg,refrigerated) VALUES
  (1,'配送員A','090-1111-1111','2tトラック(冷蔵)',2000,true),
  (1,'配送員B','090-2222-2222','軽トラ',350,false),
  (3,'配送員C(柳井)','090-3333-3333','1.5tトラック',1500,false);

-- 本日の配送依頼
INSERT INTO delivery_requests (
  request_code, shipper_id, receiver_id,
  pickup_address, pickup_lat, pickup_lng,
  delivery_address, delivery_lat, delivery_lng,
  pickup_window_start, pickup_window_end, delivery_deadline,
  weight_kg, refrigerated, cargo_description
)
SELECT
  'REQ-SEED-' || LPAD(row_number() OVER ()::text, 3, '0'),
  v.shipper_id, v.receiver_id,
  s.address, s.lat, s.lng,
  r.address, r.lat, r.lng,
  (CURRENT_DATE + TIME '08:00') AT TIME ZONE 'Asia/Tokyo',
  (CURRENT_DATE + TIME '11:00') AT TIME ZONE 'Asia/Tokyo',
  (CURRENT_DATE + TIME '16:00') AT TIME ZONE 'Asia/Tokyo',
  v.weight_kg, v.refrigerated, v.cargo
FROM (VALUES
  (4::bigint, 1::bigint, 80.0, false, '葉物野菜・トマト'),
  (4, 2, 60.0, false, '根菜類'),
  (6, 1, 40.0, false, '直売野菜セット'),
  (3, 7, 200.0, true,  '加工用キャベツ・玉ねぎ(冷蔵)'),
  (7, 5, 120.0, true,  'カット野菜製品(冷蔵)'),
  (6, 2, 30.0, false, '果物')
) AS v(shipper_id, receiver_id, weight_kg, refrigerated, cargo)
JOIN members s ON s.id = v.shipper_id
JOIN members r ON r.id = v.receiver_id;
