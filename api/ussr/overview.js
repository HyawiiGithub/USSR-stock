import { getEconomySnapshot } from "../../ussr-economy-data.mjs";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();
  const data = getEconomySnapshot();
  res.status(200).json(data);
}
