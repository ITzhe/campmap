// supabase/functions/sms-verify/index.ts
// 阿里云号码认证服务 - 核验短信验证码
// 环境变量需设置:
//   ALIYUN_ACCESS_KEY_ID     - 阿里云 AccessKey ID
//   ALIYUN_ACCESS_KEY_SECRET - 阿里云 AccessKey Secret
//   ALIYUN_SMS_SIGN_NAME     - 短信签名名称（与发送时一致）

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

async function getSignature(
  params: Record<string, string>,
  accessKeySecret: string,
  method: string = "POST"
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQueryString = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(canonicalizedQueryString)}`;

  const key = new TextEncoder().encode(accessKeySecret + "&");
  const data = new TextEncoder().encode(stringToSign);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  return signature;
}

async function checkSmsVerifyCode(phone: string, code: string): Promise<any> {
  const accessKeyId = Deno.env.get("ALIYUN_ACCESS_KEY_ID") || "";
  const accessKeySecret = Deno.env.get("ALIYUN_ACCESS_KEY_SECRET") || "";
  const signName = Deno.env.get("ALIYUN_SMS_SIGN_NAME") || "";

  if (!accessKeyId || !accessKeySecret) {
    throw new Error("服务端未配置阿里云 AccessKey");
  }
  if (!signName) {
    throw new Error("服务端未配置短信签名 ALIYUN_SMS_SIGN_NAME");
  }

  const params: Record<string, string> = {
    Action: "CheckSmsVerifyCode",
    Version: "2017-05-25",
    Format: "JSON",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: Math.random().toString(36).substring(2, 15) + Date.now(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    PhoneNumber: phone,
    VerifyCode: code,
    SignName: signName,
  };

  const signature = await getSignature(params, accessKeySecret);
  params["Signature"] = signature;

  // 使用 POST 方式发送
  const bodyParts = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  const url = "https://dypnsapi.aliyuncs.com/";

  console.log("调用阿里云核验接口(POST), phone:", phone);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParts,
  });

  const data = await res.json();
  console.log("阿里云核验接口返回 Code:", data.Code, "VerifyResult:", data.VerifyResult);

  return data;
}

console.info("sms-verify function started");

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { phone, code } = await req.json();

      if (!phone || !code) {
        return Response.json(
          { success: false, message: "手机号和验证码不能为空" },
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (!/^1[3-9]\d{9}$/.test(phone)) {
        return Response.json(
          { success: false, message: "手机号格式不正确" },
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const result = await checkSmsVerifyCode(phone, code);

      if (result.Code === "OK" && result.VerifyResult) {
        return Response.json(
          {
            success: true,
            message: "验证成功",
            verifyResult: result.VerifyResult,
            requestId: result.RequestId,
          },
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } else {
        return Response.json(
          {
            success: false,
            message: result.Message || "验证码错误或已过期",
            code: result.Code,
            verifyResult: result.VerifyResult,
            requestId: result.RequestId,
          },
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } catch (err) {
      console.error("sms-verify error:", err);
      return Response.json(
        { success: false, message: "验证失败: " + (err.message || String(err)) },
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  },
};
