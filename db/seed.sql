-- ============================================================
-- サンプルデータ (山口県岩国市〜広島近郊)
-- 実行前に schema.sql を実行しておくこと
-- ============================================================

TRUNCATE TABLE vehicle_positions, route_stops, routes, drivers, vehicles, members RESTART IDENTITY CASCADE;

-- 組合員
INSERT INTO members (code,name,type,address,lat,lng,contact_name,phone,email) VALUES
  ('M001','岩国八百屋本店','store','山口県岩国市麻里布町1-1-1',34.1664,132.2204,'田中太郎','0827-00-0001','iwakuni@example.com'),
  ('M002','岩国八百屋駅前店','store','山口県岩国市岩国2-2-2',34.1495,132.1799,'佐藤花子','0827-00-0002','eki@example.com'),
  ('M003','柳井青果卸','wholesaler','山口県柳井市柳井3-3-3',33.9633,132.1018,'鈴木一郎','0820-00-0003','yanai@example.com'),
  ('M004','周南農園','farmer','山口県周南市徳山4-4-4',34.0556,131.8060,'高橋次郎','0834-00-0004','farm@example.com'),
  ('M005','広島フルーツ商会','wholesaler','広島県大竹市本町5-5-5',34.2400,132.2200,'山田三郎','0827-00-0005','hf@example.com'),
  ('M006','玖珂直売所','farmer','山口県岩国市玖珂町6-6-6',34.1090,132.0570,'中村四郎','0827-00-0006','kuga@example.com'),
  ('M007','自社加工工場','manufacturer','山口県岩国市装束町7-7-7',34.1700,132.2300,'小林五郎','0827-00-0007','factory@example.com');

-- 車両
INSERT INTO vehicles (code,name,plate_number,vehicle_type,capacity_kg,refrigerated) VALUES
  ('V001','2tトラック冷蔵','山口100あ1234','2tトラック',2000,true),
  ('V002','軽トラ1号','山口500か5678','軽トラ',350,false),
  ('V003','1.5tトラック','山口100あ9012','1.5tトラック',1500,false);

-- ドライバー
INSERT INTO drivers (member_id,name,phone,pin_code) VALUES
  (1,'山田 健太','090-1111-1111','1234'),
  (1,'鈴木 大介','090-2222-2222','2345'),
  (3,'佐藤 隆','090-3333-3333','3456');

-- 本日の予定ルート (1便)
INSERT INTO routes (route_code, name, scheduled_date, driver_id, vehicle_id, planned_start_time, status, notes) VALUES
  ('RT-DEMO-001', '午前便A (周南→岩国)', CURRENT_DATE, 1, 1, '08:00', 'planned', '葉物野菜と根菜の混載');

-- そのルートの経由地
INSERT INTO route_stops (route_id, stop_order, stop_type, member_id, address, lat, lng, cargo_description, weight_kg, refrigerated, scheduled_time)
SELECT 1, ord, stype, mid, addr, la, ln, cargo, w, ref, t::time FROM (VALUES
  (1, 'pickup',   4, '山口県周南市徳山4-4-4',     34.0556, 131.8060, '葉物野菜・トマト',    80.0, false, '08:30'),
  (2, 'pickup',   6, '山口県岩国市玖珂町6-6-6',    34.1090, 132.0570, '直売野菜セット',       40.0, false, '09:30'),
  (3, 'delivery', 1, '山口県岩国市麻里布町1-1-1', 34.1664, 132.2204, '葉物野菜・根菜セット', 120.0, false, '10:30'),
  (4, 'delivery', 2, '山口県岩国市岩国2-2-2',    34.1495, 132.1799, '直売野菜セット',         0.0, false, '11:00')
) AS v(ord, stype, mid, addr, la, ln, cargo, w, ref, t);

-- 午後便 (柳井発の冷蔵便)
INSERT INTO routes (route_code, name, scheduled_date, driver_id, vehicle_id, planned_start_time, status, notes) VALUES
  ('RT-DEMO-002', '午後便B (柳井→広島)', CURRENT_DATE, 3, 1, '13:00', 'planned', '冷蔵便');

INSERT INTO route_stops (route_id, stop_order, stop_type, member_id, address, lat, lng, cargo_description, weight_kg, refrigerated, scheduled_time)
SELECT 2, ord, stype, mid, addr, la, ln, cargo, w, ref, t::time FROM (VALUES
  (1, 'pickup',   3, '山口県柳井市柳井3-3-3',    33.9633, 132.1018, '加工用キャベツ・玉ねぎ', 200.0, true, '13:30'),
  (2, 'delivery', 7, '山口県岩国市装束町7-7-7', 34.1700, 132.2300, '加工用キャベツ・玉ねぎ', 200.0, true, '14:30'),
  (3, 'pickup',   7, '山口県岩国市装束町7-7-7', 34.1700, 132.2300, 'カット野菜製品',          120.0, true, '15:00'),
  (4, 'delivery', 5, '広島県大竹市本町5-5-5',    34.2400, 132.2200, 'カット野菜製品',          120.0, true, '15:45')
) AS v(ord, stype, mid, addr, la, ln, cargo, w, ref, t);
