const url = process.argv[2] ?? "http://localhost:43778/api/health";
const timeoutMs = Number(process.argv[3] ?? 15000);
const started = Date.now();

async function wait() {
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) process.exit(0);
    } catch {
      // API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.error(`Timed out waiting for ${url}`);
  process.exit(1);
}

await wait();
