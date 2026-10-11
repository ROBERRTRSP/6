import { createApp } from "./app.js";
import { config } from "./config.js";
import { openDb } from "./db.js";

const db = openDb(config.databasePath);
const app = createApp(db);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`POS Simple API en http://0.0.0.0:${config.port}`);
});
