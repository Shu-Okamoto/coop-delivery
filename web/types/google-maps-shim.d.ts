// @types/google.maps が利用できない環境向けの最小型シム。
// RouteMap.tsx / maps.ts で使う範囲のみを緩く定義する。
// 本番では `npm i -D @types/google.maps` に置き換えると型安全性が向上する。

declare namespace google {
  namespace maps {
    class Map {
      constructor(el: HTMLElement, opts?: any);
      fitBounds(bounds: LatLngBounds): void;
      setZoom(z: number): void;
      getZoom(): number | undefined;
    }
    class Marker {
      constructor(opts?: any);
      setMap(map: Map | null): void;
      addListener(event: string, handler: () => void): void;
    }
    class InfoWindow {
      constructor(opts?: any);
      open(map: Map, anchor?: Marker): void;
    }
    class LatLngBounds {
      extend(latLng: { lat: number; lng: number }): void;
    }
    class Polyline {
      constructor(opts?: any);
      setMap(map: Map | null): void;
    }
    class DirectionsService {
      route(req: any, cb: (result: any, status: string) => void): void;
    }
    class DirectionsRenderer {
      constructor(opts?: any);
      setDirections(result: any): void;
    }
    class Geocoder {
      geocode(
        req: { address?: string; location?: { lat: number; lng: number } },
        cb: (results: any[] | null, status: string) => void
      ): void;
    }
    const SymbolPath: {
      CIRCLE: number;
      FORWARD_CLOSED_ARROW: number;
    };
    const TravelMode: {
      DRIVING: string;
    };
    namespace event {
      function addListenerOnce(instance: any, event: string, handler: () => void): void;
    }
  }
}
