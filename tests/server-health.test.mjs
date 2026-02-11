import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

test("health endpoint responds with ok", async (t) => {
  // This test assumes the server is already running on PORT or 4242.
  // It is a lightweight smoke test rather than a full integration harness.
  const port = process.env.PORT || 4242;

  await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/health",
        method: "GET",
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            assert.equal(res.statusCode, 200);
            const data = JSON.parse(body);
            assert.equal(data.status, "ok");
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
});

