#include "BitposClient.h"

String          BitposClient::_serverUrl;
String          BitposClient::_token;
String          BitposClient::_authHeader;
String          BitposClient::_respBuf;
HTTPClient      BitposClient::_authHttp;
WiFiClientSecure BitposClient::_authClient;
HTTPClient      BitposClient::_pubHttp;
WiFiClientSecure BitposClient::_pubClient;

// ISRG Root X1 — root CA for bitpos.app (Let's Encrypt chain)
// Valid until 2035-06-04. Update when this cert expires.
static const char* ISRG_ROOT_X1 = R"(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoBggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)";

// ─── URL scratch buffer ───────────────────────────────────────────────────────
// All URL construction uses snprintf into this buffer — no String temporaries,
// no heap allocations from concatenation.  1024 bytes is required because the
// LNURL callback URL includes the full bolt11 invoice string (~500 chars):
// callbackUrl (~175) + "&k1=" + k1 (64) + "&pr=" + bolt11 (~500) + "&pin=" (4+4) ≈ 750 B
static char _urlBuf[1024];

// ─── POST body scratch buffer ─────────────────────────────────────────────────
// createInvoice request body: {"amountSats":9999999999,"memo":"posBOX"} < 64 B
static char _postBody[64];

void BitposClient::init(const String& serverUrl, const String& token) {
    _serverUrl  = serverUrl;
    _token      = token;

    // Pre-allocate auth header once — "Bearer " + token is set at init and
    // never changes, so reserve(64) grabs memory once and subsequent writes
    // (e.g. after re-provisioning) reuse the same buffer.
    _authHeader.reserve(64);
    _authHeader = "Bearer ";
    _authHeader += token;

    // Pre-allocate the shared response buffer.  All HTTP response bodies are
    // read into _respBuf; 1536 bytes covers the largest response we expect
    // (createInvoice returns a bolt11 + hash + metadata ≈ 700 B).
    // Because the buffer is already allocated, repeated _respBuf = getString()
    // calls reuse the same heap block — zero fragmentation from response bodies.
    _respBuf.reserve(1536);

    // Auth client — pinned to bitpos.app cert in production; insecure for dev.
    // Tear down any existing session so the new cert/URL takes effect immediately.
    _authClient.stop();
    if (serverUrl.indexOf("bitpos.app") >= 0) {
        _authClient.setCACert(ISRG_ROOT_X1);
    } else {
        _authClient.setInsecure();
    }
    // Keep the TLS session alive across sequential calls to the same server.
    // This eliminates the 1-3 s RSA handshake on every poll/price/invoice call.
    _authHttp.setReuse(true);

    // Pub client — used for third-party LNURL/card-server URLs only.
    // Always setInsecure: card hosts vary per wallet and we can't pin their CAs.
    _pubClient.setInsecure();
}

bool BitposClient::beginAuthRequest(const char* url) {
    // Release the previous HTTP transaction but keep the TLS socket alive so the
    // next GET/POST reuses the session without a new RSA handshake.
    _authHttp.end();
    _authHttp.setTimeout(10000);
    return _authHttp.begin(_authClient, url);
}

bool BitposClient::beginPubRequest(const char* url) {
    // Third-party hosts change per transaction — always start clean.
    _pubHttp.end();
    _pubClient.stop();
    _pubHttp.setTimeout(10000);
    return _pubHttp.begin(_pubClient, url);
}

bool BitposClient::healthCheck() {
    snprintf(_urlBuf, sizeof(_urlBuf), "%s/healthz", _serverUrl.c_str());
    if (!beginAuthRequest(_urlBuf)) return false;
    int code = _authHttp.GET();
    _authHttp.end();
    if (code <= 0) _authClient.stop();
    return (code == 200);
}

bool BitposClient::validateToken() {
    // Call an auth-gated endpoint with an intentionally invalid hash.
    // HTTP 401 = device token rejected; anything else (e.g. 400) = accepted.
    // Also warms up the TLS session for subsequent polls.
    snprintf(_urlBuf, sizeof(_urlBuf), "%s/pos/invoice/__probe__/status",
             _serverUrl.c_str());
    if (!beginAuthRequest(_urlBuf)) return false;
    _authHttp.addHeader("Authorization", _authHeader);
    int code = _authHttp.GET();
    _authHttp.end();
    if (code <= 0) _authClient.stop();
    return (code != 401 && code != 0);
}

String BitposClient::fetchCurrency() {
    // Response: { "currency": "thb" }
    snprintf(_urlBuf, sizeof(_urlBuf), "%s/pos/config", _serverUrl.c_str());
    if (!beginAuthRequest(_urlBuf)) return "";
    _authHttp.addHeader("Authorization", _authHeader);
    int code = _authHttp.GET();
    if (code != 200) {
        _authHttp.end();
        if (code <= 0) _authClient.stop();
        return "";
    }
    _respBuf = _authHttp.getString();   // reuses pre-allocated buffer
    _authHttp.end();
    Serial.printf("GET %s → HTTP %d\n", _urlBuf, code);

    JsonDocument doc;
    if (deserializeJson(doc, _respBuf)) return "";
    String cur = doc["currency"] | "";
    cur.toLowerCase();
    return cur;
}

float BitposClient::fetchPrice(const String& currency) {
    // Response: { "currency": "usd", "price": 95000.0 }
    // price = BTC price in fiat; returns sats-per-fiat = 100_000_000 / price
    snprintf(_urlBuf, sizeof(_urlBuf), "%s/price?vs_currency=%s",
             _serverUrl.c_str(), currency.c_str());
    if (!beginAuthRequest(_urlBuf)) return 0.0f;
    _authHttp.addHeader("Authorization", _authHeader);
    int code = _authHttp.GET();
    if (code != 200) {
        _authHttp.end();
        if (code <= 0) _authClient.stop();
        return 0.0f;
    }
    _respBuf = _authHttp.getString();   // reuses pre-allocated buffer
    _authHttp.end();
    Serial.printf("GET %s → HTTP %d\n", _urlBuf, code);

    JsonDocument doc;
    if (deserializeJson(doc, _respBuf)) return 0.0f;
    float btcPrice = doc["price"] | 0.0f;
    if (btcPrice <= 0.0f) return 0.0f;
    return 100000000.0f / btcPrice;     // sats per 1 unit of currency
}

String BitposClient::pollInvoiceStatus(const String& paymentHash) {
    snprintf(_urlBuf, sizeof(_urlBuf), "%s/pos/invoice/%s/status",
             _serverUrl.c_str(), paymentHash.c_str());
    if (!beginAuthRequest(_urlBuf)) {
        _authClient.stop();
        return "error";
    }
    _authHttp.addHeader("Authorization", _authHeader);
    int code = _authHttp.GET();
    Serial.printf("GET %s → HTTP %d\n", _urlBuf, code);
    if (code != 200) {
        _authHttp.end();
        if (code <= 0) _authClient.stop();
        return "error";
    }
    _respBuf = _authHttp.getString();   // reuses pre-allocated buffer
    _authHttp.end();

    JsonDocument doc;
    if (deserializeJson(doc, _respBuf)) return "error";
    return doc["status"] | "pending";
}

Invoice BitposClient::createInvoice(long amountSats, String& err) {
    Invoice inv;
    snprintf(_urlBuf, sizeof(_urlBuf), "%s/pos/invoice", _serverUrl.c_str());
    // Build request JSON in static buffer — no heap allocation
    snprintf(_postBody, sizeof(_postBody),
             "{\"amountSats\":%ld,\"memo\":\"posBOX\"}", amountSats);

    if (!beginAuthRequest(_urlBuf)) {
        _authClient.stop();
        err = "Connection failed";
        return inv;
    }
    _authHttp.addHeader("Authorization", _authHeader);
    _authHttp.addHeader("Content-Type", "application/json");
    int code = _authHttp.POST((uint8_t*)_postBody, strlen(_postBody));
    Serial.printf("POST %s → HTTP %d\n", _urlBuf, code);
    if (code <= 0) {
        _authHttp.end();
        _authClient.stop();
        err = "Transport error";
        return inv;
    }
    _respBuf = _authHttp.getString();   // reuses pre-allocated buffer
    _authHttp.end();

    JsonDocument doc;
    if (deserializeJson(doc, _respBuf)) { err = "Invalid JSON"; return inv; }

    if (doc["error"].is<const char*>()) {
        err = doc["error"].as<String>();
        return inv;
    }

    // These assignments write into pre-allocated Invoice fields (reserved in
    // main.cpp's handleConnectingWifi after WiFi connects).  As long as the
    // content fits within the reserved capacity no heap reallocation occurs.
    inv.bolt11      = doc["bolt11"].as<String>();
    inv.paymentHash = doc["paymentHash"].as<String>();
    inv.amountSats  = doc["amountSats"].as<long>();
    inv.expiresAt   = doc["expiresAt"].as<String>();
    return inv;
}

BitposClient::LnurlWithdraw BitposClient::fetchLnurl(const String& url, String& err) {
    LnurlWithdraw lw;
    // doPublicGet replacement — third-party card server; must NOT send device Bearer token
    if (!beginPubRequest(url.c_str())) {
        err = "No response from card server";
        return lw;
    }
    int code = _pubHttp.GET();
    if (code != 200) {
        _pubHttp.end();
        _pubClient.stop();
        err = "No response from card server";
        return lw;
    }
    _respBuf = _pubHttp.getString();    // reuses pre-allocated buffer
    _pubHttp.end();
    _pubClient.stop();

    JsonDocument doc;
    if (deserializeJson(doc, _respBuf)) { err = "Invalid JSON from card"; return lw; }

    if (doc["status"] == "ERROR") {
        err = doc["reason"] | "Card declined";
        return lw;
    }

    lw.tag                = doc["tag"] | "";
    lw.callback           = doc["callback"] | "";
    lw.k1                 = doc["k1"] | "";
    lw.maxWithdrawable    = doc["maxWithdrawable"] | 0L;
    lw.defaultDescription = doc["defaultDescription"] | "";
    // LUD-21: pinLimit is in msats; absent field means no PIN required.
    lw.pinLimitMsats = doc["pinLimit"].isNull() ? -1L : doc["pinLimit"].as<long>();

    if (lw.tag != "withdrawRequest" || lw.callback.isEmpty()) {
        err = "Invalid LNURL-withdraw response";
    }
    return lw;
}

String BitposClient::callLnurlCallback(const String& callbackUrl,
                                       const String& k1,
                                       const String& bolt11,
                                       const String& pin) {
    // Build URL from components — avoids fragile string-slice reconstruction.
    // Use _urlBuf for the base; append directly since callback URL may already
    // contain '?' — total length should stay well under 256 bytes.
    snprintf(_urlBuf, sizeof(_urlBuf), "%s%sk1=%s&pr=%s%s%s",
             callbackUrl.c_str(),
             (callbackUrl.indexOf('?') < 0 ? "?" : "&"),
             k1.c_str(),
             bolt11.c_str(),
             (pin.isEmpty() ? "" : "&pin="),
             (pin.isEmpty() ? "" : pin.c_str()));

    // Uses ephemeral pub client — third-party card server; must NOT send device token
    if (!beginPubRequest(_urlBuf)) return "Connection failed";
    int code = _pubHttp.GET();
    _respBuf = _pubHttp.getString();    // reuses pre-allocated buffer
    _pubHttp.end();
    _pubClient.stop();

    if (code != 200) return "Server returned " + String(code);

    JsonDocument doc;
    if (deserializeJson(doc, _respBuf)) return "Invalid response";

    String status = doc["status"] | "ERROR";
    if (status == "OK") return "";
    return doc["reason"] | "Payment failed";
}
