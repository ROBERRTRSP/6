const url = process.argv[2];
if (!url) {
  console.error("Usage: node wait-for-api.mjs <url>");
  process.exit(1);
}

const deadline = Date.now() + 30_000;

async function wait() {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) process.exit(0);
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.error(`Timed out waiting for ${url}`);
  process.exit(1);
}

wait();
