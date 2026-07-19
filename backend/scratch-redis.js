const { Redis } = require("ioredis");

const client = new Redis("rediss://default:gQAAAAAAAoHyAAIgcDE2Y2FkN2Q5NjY1ZmI0ZDlmOGYwODg4MjBkMWYyZDdhYw@close-cardinal-164338.upstash.io:6379", {
  maxRetriesPerRequest: null
});

client.on("connect", () => console.log("Connected to Upstash!"));
client.on("error", (err) => console.error("Error:", err));

client.ping().then(res => {
  console.log("PING:", res);
  client.quit();
});
