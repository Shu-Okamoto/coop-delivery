/**
 * 共同配送マッチングエンジン (純粋関数のみ・DB非依存)
 */

function distanceKm(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lat2 == null) return 999;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function clusterRequests(requests, opts = {}) {
  const maxRadius = opts.maxRadiusKm || 15;
  const capacity = opts.capacityKg || 1000;
  const requireRef = !!opts.refrigerated;

  const pool = requests.filter((r) =>
    requireRef ? true : !r.refrigerated
  );

  const groups = [];
  const used = new Set();

  for (const seed of pool) {
    if (used.has(seed.id)) continue;
    const group = [seed];
    used.add(seed.id);
    let totalWeight = Number(seed.weight_kg);

    for (const cand of pool) {
      if (used.has(cand.id)) continue;
      const candW = Number(cand.weight_kg);
      if (totalWeight + candW > capacity) continue;

      const dPickup = distanceKm(
        seed.pickup_lat, seed.pickup_lng,
        cand.pickup_lat, cand.pickup_lng
      );
      const dDeliver = distanceKm(
        seed.delivery_lat, seed.delivery_lng,
        cand.delivery_lat, cand.delivery_lng
      );

      if (dPickup <= maxRadius || dDeliver <= maxRadius) {
        group.push(cand);
        used.add(cand.id);
        totalWeight += candW;
      }
    }
    groups.push(group);
  }
  return groups;
}

function buildStopSequence(group) {
  const pickups = group.map((r) => ({
    type: 'pickup',
    request_id: r.id,
    member_id: r.shipper_id,
    address: r.pickup_address,
    lat: r.pickup_lat,
    lng: r.pickup_lng,
  }));
  const deliveries = group.map((r) => ({
    type: 'delivery',
    request_id: r.id,
    member_id: r.receiver_id,
    address: r.delivery_address,
    lat: r.delivery_lat,
    lng: r.delivery_lng,
  }));

  function nearestSort(stops, sLat, sLng) {
    const sorted = [];
    let curLat = sLat, curLng = sLng;
    const rest = [...stops];
    while (rest.length > 0) {
      let bestIdx = 0, bestD = Infinity;
      for (let i = 0; i < rest.length; i++) {
        const d = distanceKm(curLat, curLng, rest[i].lat, rest[i].lng);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      const next = rest.splice(bestIdx, 1)[0];
      sorted.push(next);
      curLat = next.lat; curLng = next.lng;
    }
    return sorted;
  }

  const sortedPickups = nearestSort(pickups, pickups[0].lat, pickups[0].lng);
  const last = sortedPickups[sortedPickups.length - 1];
  const sortedDeliveries = nearestSort(deliveries, last.lat, last.lng);

  return [...sortedPickups, ...sortedDeliveries].map((s, i) => ({
    ...s,
    stop_order: i + 1,
  }));
}

function estimateDistance(stops) {
  let total = 0;
  for (let i = 1; i < stops.length; i++) {
    total += distanceKm(stops[i-1].lat, stops[i-1].lng, stops[i].lat, stops[i].lng);
  }
  return Math.round(total * 10) / 10;
}

function calcCostShares(group, totalDistanceKm, ratePerKm = 80) {
  const totalCost = Math.round(totalDistanceKm * ratePerKm);
  const totalWeight = group.reduce((s, r) => s + Number(r.weight_kg), 0);
  return group.map((r) => ({
    request_id: r.id,
    shipper_id: r.shipper_id,
    weight_share: Number(r.weight_kg) / totalWeight,
    amount_yen: Math.round((Number(r.weight_kg) / totalWeight) * totalCost),
  }));
}

module.exports = {
  distanceKm,
  clusterRequests,
  buildStopSequence,
  estimateDistance,
  calcCostShares,
};
