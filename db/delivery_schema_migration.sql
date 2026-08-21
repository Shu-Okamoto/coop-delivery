-- ============================================================
-- coop-delivery のデータを新プロジェクトの delivery スキーマへ移行
-- Supabase SQL Editor に「全文をまとめて」貼り付けて Run してください。
--   ※ pg_dumpall の巨大ダンプは使いません。必要な6テーブルだけを再構築します。
-- ============================================================

-- ===== 0. スキーマ作成 =====
CREATE SCHEMA IF NOT EXISTS delivery;

-- ===== 1. テーブル定義 =====
CREATE TABLE IF NOT EXISTS delivery.members (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('store','wholesaler','farmer','manufacturer')),
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.vehicles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plate_number TEXT,
  vehicle_type TEXT,
  capacity_kg INTEGER DEFAULT 1000,
  refrigerated BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.drivers (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT REFERENCES delivery.members(id),
  name TEXT NOT NULL,
  phone TEXT,
  pin_code TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.routes (
  id BIGSERIAL PRIMARY KEY,
  route_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  driver_id BIGINT REFERENCES delivery.drivers(id),
  vehicle_id BIGINT REFERENCES delivery.vehicles(id),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  planned_start_time TIME,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.route_stops (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES delivery.routes(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL,
  stop_type TEXT NOT NULL CHECK (stop_type IN ('pickup','delivery')),
  member_id BIGINT REFERENCES delivery.members(id),
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  cargo_description TEXT,
  weight_kg NUMERIC(10,2),
  refrigerated BOOLEAN DEFAULT FALSE,
  scheduled_time TIME,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery.vehicle_positions (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT REFERENCES delivery.routes(id) ON DELETE CASCADE,
  vehicle_id BIGINT REFERENCES delivery.vehicles(id),
  driver_id BIGINT REFERENCES delivery.drivers(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,
  speed_kmh DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_routes_date ON delivery.routes(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_route ON delivery.route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_delivery_positions_route ON delivery.vehicle_positions(route_id, recorded_at DESC);

-- ===== 2. データ投入（id を明示。親→子の順） =====

-- members
INSERT INTO delivery.members (id,code,name,type,address,lat,lng,contact_name,phone,email,created_at) VALUES
 (1,'M001','みかわ西岩国店','store','〒741-0062 山口県岩国市岩国２丁目１６−２',34.164581,132.180001,'岡本修','0827-43-4773','mikawanishiten@gmail.com','2026-05-15 01:51:12.359494+00'),
 (2,'M002','みかわ南岩国店','store','〒740-0034 山口県岩国市南岩国町１丁目２１−３３',34.13393979194037,132.20307069510196,'岡本','0827-32-6510','mikawaminamiten@gmail.com','2026-05-15 01:51:12.359494+00'),
 (3,'M003','岩国卸売市場','wholesaler','〒740-0032 山口県岩国市尾津町５丁目１１−１ 地方卸売市場内',34.1284469852156,132.218277492701,NULL,'0827-32-1346','s13.okamoto@gmail.com','2026-05-15 01:51:12.359494+00'),
 (4,'M004','菜さい来んさい下松店','store','〒744-0018 山口県下松市西柳２丁目３−４８',34.01705591392743,131.86441045092755,NULL,'0833414573',NULL,'2026-05-15 01:51:12.359494+00'),
 (5,'M005','菜さい来んさい！三田川店','store','〒745-0873 山口県周南市徳山三田川５８２５−９ 三田川５８２５−９',34.059695756613,131.81596492581642,NULL,'0834311000',NULL,'2026-05-15 01:51:12.359494+00'),
 (6,'M006','里の厨','store','〒743-0105 山口県光市束荷２３９１−１９',34.0127202701667,132.000080324223,NULL,'0820490831','kuga@example.com','2026-05-15 01:51:12.359494+00'),
 (7,'M007','菜さい来んさい！新南陽店','store','〒746-0015 山口県周南市清水１丁目１０−２８ 東ソー生協 内',34.070627153475634,131.76862564116274,NULL,'0834642466',NULL,'2026-05-15 01:51:12.359494+00'),
 (8,'M008','ソレイネ周南','store','〒745-1131 山口県周南市戸田２７１３',34.074426639012174,131.68805921418152,NULL,'0834833303',NULL,'2026-05-15 06:43:03.20555+00'),
 (9,'M009','道の駅 潮彩市場 防府','store','〒747-0824 山口県防府市新築地町２−３',34.0379855749333,131.596907678777,NULL,'0835282100',NULL,'2026-05-15 06:43:51.63883+00'),
 (10,'M010','道の駅 ピュアラインにしき','store','〒740-0723 山口県岩国市錦町府谷１１７−１１７',34.2786283382883,131.969552425825,NULL,'0827710011',NULL,'2026-05-15 06:44:51.007099+00'),
 (11,'M011','ファムズキッチンいわくに','store','〒741-0092 山口県岩国市多田９７−２',34.17355691328658,132.15740164061492,NULL,'0827440831',NULL,'2026-05-15 06:48:02.928412+00'),
 (12,'M012','わくわく広場レクト広島店','store','〒733-0831 広島県広島市西区扇２丁目１−４５',34.71665192294401,132.3944200037285,NULL,'08012510232',NULL,'2026-05-15 06:53:21.07413+00'),
 (13,'M013','広島市中央卸売市場','wholesaler','〒733-0832 広島県広島市西区草津港１丁目８−１',34.36704409296066,132.40223155466424,NULL,'0822792410',NULL,'2026-05-15 06:55:23.797709+00'),
 (14,'M014','周南市地方卸売市場','store','〒745-0814 山口県周南市鼓海１丁目３２４−１８',34.03559128412919,131.82318259655145,NULL,'0834250708',NULL,'2026-05-15 06:57:08.458713+00'),
 (17,'M015','みかわ惣菜本部','manufacturer','〒740-0032 山口県岩国市尾津町５丁目１１−１ 地方卸売市場内',34.1284,132.2183,'岡本','0827-32-7045',NULL,'2026-05-15 06:58:35.659501+00'),
 (18,'M016','デナリファーム','farmer','〒740-1432 山口県岩国市由宇町神東２０６１−１',33.99581499392531,132.20551172581415,NULL,'0827934037',NULL,'2026-05-15 06:59:34.849165+00'),
 (19,'M017','CARPBEACH（潮風公園）','store','〒740-1488 山口県岩国市由宇町８５００−６',34.03229173277702,132.21760442581547,NULL,'0827620155',NULL,'2026-05-15 07:00:47.912714+00'),
 (20,'M018','神東ファーム','store','〒740-1432 山口県岩国市由宇町神東１０６１９−４',33.99835560528699,132.20718996207103,NULL,'0827636036',NULL,'2026-05-15 07:01:37.125024+00'),
 (21,'M019','玖珂グリーンフィールド','farmer','〒742-0344 山口県岩国市玖珂町５５４７',34.0856859559432,132.072626352635,NULL,'0827823080',NULL,'2026-05-15 07:03:45.156105+00'),
 (22,'M020','粟農園','farmer','〒742-0414 山口県岩国市周東町田尻４９１−１',35.901658972675065,131.66870950225692,NULL,'09068358112',NULL,'2026-05-15 07:04:36.364505+00');

-- vehicles
INSERT INTO delivery.vehicles (id,code,name,plate_number,vehicle_type,capacity_kg,refrigerated,active,created_at) VALUES
 (1,'V001','2tトラック冷蔵','山口100あ1234','2tトラック',2000,true,true,'2026-05-15 01:51:12.359494+00'),
 (2,'V002','軽トラ1号','山口500か5678','軽トラ',350,false,true,'2026-05-15 01:51:12.359494+00'),
 (3,'V003','1.5tトラック','山口100あ9012','1.5tトラック',1500,false,true,'2026-05-15 01:51:12.359494+00');

-- drivers
INSERT INTO delivery.drivers (id,member_id,name,phone,pin_code,active,created_at) VALUES
 (1,1,'山田 健太','090-1111-1111','1234',true,'2026-05-15 01:51:12.359494+00'),
 (2,1,'鈴木 大介','090-2222-2222','2345',true,'2026-05-15 01:51:12.359494+00'),
 (3,3,'佐藤 隆','090-3333-3333','3456',true,'2026-05-15 01:51:12.359494+00');

-- routes
INSERT INTO delivery.routes (id,route_code,name,scheduled_date,driver_id,vehicle_id,start_time,end_time,planned_start_time,status,notes,created_at,updated_at) VALUES
 (1,'RT-DEMO-001','午前便A (周南→岩国)','2026-05-15',1,1,NULL,NULL,'08:00:00','planned','葉物野菜と根菜の混載','2026-05-15 01:51:12.359494+00','2026-05-15 01:53:00.002+00'),
 (2,'RT-DEMO-002','午後便B (柳井→広島)','2026-05-15',3,1,NULL,NULL,'13:00:00','planned','冷蔵便','2026-05-15 01:51:12.359494+00','2026-05-15 01:51:12.359494+00'),
 (3,'RT-MP6K64NB','a','2026-05-15',1,2,NULL,NULL,'08:00:00','planned',NULL,'2026-05-15 06:50:44.102446+00','2026-05-15 06:50:44.102446+00'),
 (4,'RT-MPYSSDXQ','ｌｌｌ','2026-06-04',NULL,NULL,NULL,NULL,'08:00:00','planned',NULL,'2026-06-04 01:09:32.309535+00','2026-06-04 01:09:32.309535+00');

-- route_stops
INSERT INTO delivery.route_stops (id,route_id,stop_order,stop_type,member_id,address,lat,lng,cargo_description,weight_kg,refrigerated,scheduled_time,arrived_at,completed_at,completed,notes,photo_url,created_at) VALUES
 (5,2,1,'pickup',3,'山口県柳井市柳井3-3-3',33.9633,132.1018,'加工用キャベツ・玉ねぎ',200.00,true,'13:30:00',NULL,NULL,false,NULL,NULL,'2026-05-15 01:51:12.359494+00'),
 (6,2,2,'delivery',7,'山口県岩国市装束町7-7-7',34.17,132.23,'加工用キャベツ・玉ねぎ',200.00,true,'14:30:00',NULL,NULL,false,NULL,NULL,'2026-05-15 01:51:12.359494+00'),
 (7,2,3,'pickup',7,'山口県岩国市装束町7-7-7',34.17,132.23,'カット野菜製品',120.00,true,'15:00:00',NULL,NULL,false,NULL,NULL,'2026-05-15 01:51:12.359494+00'),
 (8,2,4,'delivery',5,'広島県大竹市本町5-5-5',34.24,132.22,'カット野菜製品',120.00,true,'15:45:00',NULL,NULL,false,NULL,NULL,'2026-05-15 01:51:12.359494+00'),
 (9,1,1,'pickup',4,'山口県周南市徳山4-4-4',34.0556,131.806,'葉物野菜・トマト',80.00,false,'08:30:00',NULL,NULL,false,NULL,NULL,'2026-05-15 01:53:00.519133+00'),
 (10,1,2,'pickup',6,'山口県岩国市玖珂町6-6-6',34.109,132.057,'直売野菜セット',40.00,false,'09:30:00',NULL,NULL,false,NULL,NULL,'2026-05-15 01:53:00.519133+00'),
 (11,1,3,'pickup',5,'広島県大竹市本町5-5-5',34.24,132.22,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 01:53:00.519133+00'),
 (12,1,4,'delivery',1,'山口県岩国市麻里布町1-1-1',34.1664,132.2204,'葉物野菜・根菜セット',120.00,false,'10:30:00',NULL,NULL,false,NULL,NULL,'2026-05-15 01:53:00.519133+00'),
 (13,1,5,'delivery',2,'山口県岩国市岩国2-2-2',34.1495,132.1799,'直売野菜セット',NULL,false,'11:00:00',NULL,NULL,false,NULL,NULL,'2026-05-15 01:53:00.519133+00'),
 (14,3,1,'pickup',3,'〒740-0032 山口県岩国市尾津町５丁目１１−１ 地方卸売市場内',34.1284469852156,132.218277492701,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 06:50:44.286166+00'),
 (15,3,2,'delivery',11,'〒741-0092 山口県岩国市多田９７−２',34.1735569132866,132.157401640615,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 06:50:44.286166+00'),
 (16,3,3,'delivery',6,'〒743-0105 山口県光市束荷２３９１−１９',34.0127202701667,132.000080324223,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 06:50:44.286166+00'),
 (17,3,4,'delivery',4,'〒744-0018 山口県下松市西柳２丁目３−４８',34.0170559139274,131.864410450928,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 06:50:44.286166+00'),
 (18,3,5,'delivery',5,'〒745-0873 山口県周南市徳山三田川５８２５−９ 三田川５８２５−９',34.059695756613,131.815964925816,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 06:50:44.286166+00'),
 (19,3,6,'delivery',7,'〒746-0015 山口県周南市清水１丁目１０−２８ 東ソー生協 内',34.0706271534756,131.768625641163,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 06:50:44.286166+00'),
 (20,3,7,'delivery',8,'〒745-1131 山口県周南市戸田２７１３',34.0744266390122,131.688059214182,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 06:50:44.286166+00'),
 (21,3,8,'delivery',9,'〒747-0824 山口県防府市新築地町２−３',34.0379855749333,131.596907678777,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-05-15 06:50:44.286166+00'),
 (22,4,1,'pickup',3,'〒740-0032 山口県岩国市尾津町５丁目１１−１ 地方卸売市場内',34.1284469852156,132.218277492701,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-06-04 01:09:32.475593+00'),
 (23,4,2,'pickup',6,'〒743-0105 山口県光市束荷２３９１−１９',34.0127202701667,132.000080324223,NULL,NULL,false,NULL,NULL,NULL,false,NULL,NULL,'2026-06-04 01:09:32.475593+00');

-- vehicle_positions
INSERT INTO delivery.vehicle_positions (id,route_id,vehicle_id,driver_id,lat,lng,heading,speed_kmh,recorded_at) VALUES
 (1,1,1,1,34.1287205351587,132.2185601528575,NULL,NULL,'2026-05-15 02:01:46.780777+00');

-- ===== 3. シーケンスを最大idに合わせる（次の登録でid衝突を防ぐ） =====
SELECT setval('delivery.members_id_seq',           (SELECT MAX(id) FROM delivery.members));
SELECT setval('delivery.vehicles_id_seq',          (SELECT MAX(id) FROM delivery.vehicles));
SELECT setval('delivery.drivers_id_seq',           (SELECT MAX(id) FROM delivery.drivers));
SELECT setval('delivery.routes_id_seq',            (SELECT MAX(id) FROM delivery.routes));
SELECT setval('delivery.route_stops_id_seq',       (SELECT MAX(id) FROM delivery.route_stops));
SELECT setval('delivery.vehicle_positions_id_seq', (SELECT MAX(id) FROM delivery.vehicle_positions));

-- ===== 4. 最新位置ビュー（security_invoker で作成者権限のバイパスを防ぐ） =====
CREATE OR REPLACE VIEW delivery.vehicle_latest_positions
  WITH (security_invoker = true)
AS
SELECT DISTINCT ON (route_id)
  route_id, vehicle_id, driver_id, lat, lng, heading, speed_kmh, recorded_at
FROM delivery.vehicle_positions
ORDER BY route_id, recorded_at DESC;

-- ===== 5. RLS（サービスロールのみ全許可。API は service_role キーで接続） =====
ALTER TABLE delivery.members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.vehicles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.drivers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.routes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.route_stops        ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery.vehicle_positions  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "service_role full" ON delivery.members           FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON delivery.vehicles          FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON delivery.drivers           FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON delivery.routes            FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON delivery.route_stops       FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON delivery.vehicle_positions FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 6. 件数確認 =====
SELECT 'members' AS t, count(*) FROM delivery.members
UNION ALL SELECT 'vehicles', count(*) FROM delivery.vehicles
UNION ALL SELECT 'drivers', count(*) FROM delivery.drivers
UNION ALL SELECT 'routes', count(*) FROM delivery.routes
UNION ALL SELECT 'route_stops', count(*) FROM delivery.route_stops
UNION ALL SELECT 'vehicle_positions', count(*) FROM delivery.vehicle_positions;

-- 期待値: members=20, vehicles=3, drivers=3, routes=4, route_stops=19, vehicle_positions=1
