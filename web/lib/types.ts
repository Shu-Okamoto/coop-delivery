export type MemberType = 'store' | 'wholesaler' | 'farmer' | 'manufacturer';

export type Member = {
  id: number;
  code: string;
  name: string;
  type: MemberType;
  address: string;
  lat: number;
  lng: number;
  contact_name?: string;
  phone?: string;
  email?: string;
  login_id?: string | null;
  has_login?: boolean;
};

export type Vehicle = {
  id: number;
  code: string;
  name: string;
  plate_number?: string;
  vehicle_type?: string;
  capacity_kg: number;
  refrigerated: boolean;
  active?: boolean;
};

export type Driver = {
  id: number;
  member_id?: number | null;
  name: string;
  phone?: string;
  active?: boolean;
  // pin_code は一覧APIでは返らない。登録・編集時のみフォームで扱う
};

export type RouteStop = {
  id?: number;
  stop_order: number;
  stop_type: 'pickup' | 'delivery';
  member_id?: number | null;
  member_name?: string;
  address: string;
  lat: number;
  lng: number;
  cargo_description?: string;
  weight_kg?: number;
  refrigerated?: boolean;
  scheduled_time?: string;
  arrived_at?: string | null;
  completed_at?: string | null;
  completed?: boolean;
  notes?: string;
  photo_url?: string | null;
};

export type Route = {
  id: number;
  route_code: string;
  name: string;
  scheduled_date: string;
  driver_id?: number | null;
  vehicle_id?: number | null;
  driver_name?: string;
  driver_phone?: string;
  vehicle_name?: string;
  vehicle_plate?: string;
  planned_start_time?: string;
  start_time?: string;
  end_time?: string;
  status: 'draft' | 'recruiting' | 'planned' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  stops?: RouteStop[];
  latest_position?: LatestPosition | null;
};

export type LatestPosition = {
  route_id: number;
  vehicle_id?: number;
  driver_id?: number;
  lat: number;
  lng: number;
  heading?: number;
  speed_kmh?: number;
  recorded_at: string;
};

export type RoutePositionMarker = {
  route_id: number;
  route_code: string;
  route_name: string;
  status: string;
  driver_name?: string;
  vehicle_name?: string;
  lat: number | null;
  lng: number | null;
  heading?: number;
  recorded_at: string | null;
};
