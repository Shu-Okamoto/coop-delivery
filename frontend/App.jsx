
import { useEffect, useState } from "react";

export default function App() {
  const [deliveries, setDeliveries] = useState([]);

  useEffect(() => {
    fetch("http://localhost:3000/api/deliveries")
      .then(res => res.json())
      .then(setDeliveries);
  }, []);

  return (
    <div>
      <h1>配送一覧</h1>
      {deliveries.map(d => (
        <div key={d.id}>
          {d.name} - {d.status}
        </div>
      ))}
    </div>
  );
}
