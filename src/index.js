import { mdmFetch } from './api/client.js';

// Example placeholder — replace `path`, method and body with the real
// read endpoint once its headers/payload/response shape are provided.
async function main() {
  const data = await mdmFetch('/example-endpoint');
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
