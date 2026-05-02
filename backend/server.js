
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let drivers = {};
let deliveries = [
  { id: 1, name: "スーパーA", lat: 34.1711, lng: 132.2205, status: "pending" },
  { id: 2, name: "飲食店B", lat: 34.178, lng: 132.23, status: "pending" },
];

app.get("/api/deliveries", (req, res) => res.json(deliveries));

app.post("/api/deliveries/:id/complete", (req, res) => {
  const id = Number(req.params.id);
  deliveries = deliveries.map(d => d.id === id ? {...d, status:"done"} : d);
  io.emit("deliveryUpdate", deliveries);
  res.json({ success: true });
});

app.post("/api/location", (req, res) => {
  const { driverId, lat, lng } = req.body;
  drivers[driverId] = { lat, lng };
  io.emit("locationUpdate", drivers);
  res.json({ success: true });
});

io.on("connection", (socket) => {
  console.log("connected:", socket.id);
});

server.listen(3000, () => console.log("Backend running on http://localhost:3000"));
