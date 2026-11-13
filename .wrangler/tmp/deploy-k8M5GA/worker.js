var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// cloudflare/worker.ts
import { DurableObject } from "cloudflare:workers";
var PORT = 8080;
var INACTIVITY_TIMEOUT_MS = 10 * 60 * 1e3;
var FORWARDED_ENV = [
  "APP_ENV",
  "NODE_ENV",
  "PORT",
  "PUBLIC_APP_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_TEST_ACCESS_TOKEN",
  "MERCADO_PAGO_TEST_SELLER_ID",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "HOMOLOGATION_SUPABASE_URL",
  "HOMOLOGATION_SEND_NOTIFICATIONS",
  "PRODUCTION_SEND_NOTIFICATIONS",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM_EMAIL",
  "ORDER_NOTIFICATION_EMAIL",
  "TEST_EMAIL_RECIPIENTS",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_API_VERSION",
  "WHATSAPP_TEMPLATE_LANGUAGE",
  "WHATSAPP_ORDER_STORE_TEMPLATE",
  "WHATSAPP_ORDER_CUSTOMER_TEMPLATE",
  "WHATSAPP_ORDER_RECIPIENT",
  "TEST_WHATSAPP_RECIPIENTS"
];
var KarenShopContainer = class extends DurableObject {
  static {
    __name(this, "KarenShopContainer");
  }
  starting;
  async fetch(request) {
    this.starting ??= this.startAndWaitForHealth().finally(() => {
      this.starting = void 0;
    });
    await this.starting;
    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";
    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");
    forwarded.headers.set("x-forwarded-proto", new URL(request.url).protocol.slice(0, -1));
    forwarded.headers.set("x-forwarded-host", new URL(request.url).host);
    return this.ctx.container.getTcpPort(PORT).fetch(forwarded);
  }
  async startAndWaitForHealth() {
    const container = this.ctx.container;
    if (!container.running) {
      const source = this.env;
      const env = {};
      for (const name of FORWARDED_ENV) {
        const value = source[name];
        if (typeof value === "string") env[name] = value;
      }
      env.PORT = String(PORT);
      container.start({
        image: container.images.base,
        instance: "basic",
        enableInternet: true,
        env
      });
    }
    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
    const port = container.getTcpPort(PORT);
    let lastError;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const response = await port.fetch("http://container/api/health", {
          signal: AbortSignal.timeout(1500)
        });
        await response.body?.cancel();
        if (response.ok) return;
        lastError = new Error(`Health check retornou HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
      }
      await scheduler.wait(500);
    }
    throw new Error("O servidor da Karen Shop n\xE3o ficou pronto no Cloudflare.", { cause: lastError });
  }
};
var worker_default = {
  fetch(request, env) {
    return env.KAREN_SHOP.getByName("karen-beauty-shop").fetch(request);
  }
};
export {
  KarenShopContainer,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
