// Google Maps JS API を script タグで一度だけロードする内製ローダー。
// @googlemaps/js-api-loader への依存をなくし、デプロイを軽量化する。

let loaderPromise: Promise<typeof google> | null = null;

declare global {
  interface Window {
    __coopGmapsCallback?: () => void;
    // google はグローバル名前空間 (types/google-maps-shim.d.ts) で定義済み
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (loaderPromise) return loaderPromise;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY が未設定です'));
  }

  loaderPromise = new Promise<typeof google>((resolve, reject) => {
    // すでに読み込まれている場合
    if (typeof window !== 'undefined' && typeof google !== 'undefined' && google?.maps) {
      resolve(google);
      return;
    }

    const callbackName = '__coopGmapsCallback';
    window[callbackName] = () => {
      resolve(google);
      delete window[callbackName];
    };

    const script = document.createElement('script');
    // libraries=marker,routes : 高度なマーカーと Directions 用
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${apiKey}` +
      `&libraries=marker,routes&callback=${callbackName}&language=ja&region=JP`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Google Maps スクリプトの読み込みに失敗しました'));
    document.head.appendChild(script);
  });

  return loaderPromise;
}

// 経由地タイプ別のマーカー色
export const STOP_COLORS = {
  pickup: '#e67e22',
  delivery: '#27ae60',
};

// 山口県岩国市中心の初期座標
export const DEFAULT_CENTER = { lat: 34.12, lng: 132.05 };
export const DEFAULT_ZOOM = 11;

/**
 * 住所から緯度経度を取得する (Google Geocoding)。
 * Maps JS API の Geocoder を使うので追加のAPIキー設定は不要。
 * 見つからない場合は null を返す。
 */
export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; formatted: string } | null> {
  if (!address.trim()) return null;
  const g = await loadGoogleMaps();
  const geocoder = new g.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const r = results[0];
        const loc = r.geometry.location;
        // location は LatLng オブジェクト。lat()/lng() で数値を取り出す
        const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
        const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
        resolve({ lat, lng, formatted: r.formatted_address || address });
      } else {
        resolve(null);
      }
    });
  });
}
