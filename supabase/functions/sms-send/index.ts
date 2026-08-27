// supabase/functions/sms-send/index.ts
// 阿里云号码认证服务 - 发送短信验证码
// 环境变量需设置:
//   ALIYUN_ACCESS_KEY_ID     - 阿里云 AccessKey ID
//   ALIYUN_ACCESS_KEY_SECRET - 阿里云 AccessKey Secret
//   ALIYUN_SMS_SIGN_NAME     - 短信签名名称（赠送签名列表中选一个）
//   ALIYUN_SMS_TEMPLATE_CODE - 短信模板Code（默认100001登录/注册模板）

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 阿里云 API 签名工具
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

async function getSignature(
  params: Record<string, string>,
  accessKeySecret: string
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQueryString = sortedKeys
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  const stringToSign = `GET&${percentEncode("/")}&${percentEncode(canonicalizedQueryString)}`;

  // 使用 Web Crypto API 计算 HMAC-SHA1
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

async function sendSmsVerifyCode(phone: string): Promise<any> {
  const accessKeyId = Deno.env.get("ALIYUN_ACCESS_KEY_ID") || "";
  const accessKeySecret = Deno.env.get("ALIYUN_ACCESS_KEY_SECRET") || "";
  const signName = Deno.env.get("ALIYUN_SMS_SIGN_NAME") || "";
  const templateCode = Deno.env.get("ALIYUN_SMS_TEMPLATE_CODE") || "100001";

  if (!accessKeyId || !accessKeySecret) {
    throw new Error("服务端未配置阿里云 AccessKey");
  }
  if (!signName) {
    throw new Error("服务端未配置短信签名 ALIYUN_SMS_SIGN_NAME");
  }

  // 模板参数：##code## 是验证码占位符，min 是有效期（仅用于短信内容展示）
  const templateParam = JSON.stringify({ code: "##code##", min: "5" });

  const params: Record<string, string> = {
    Action: "SendSmsVerifyCode",
    Version: "2017-05-25",
    Format: "JSON",
    AccessKeyId: accessKeyId,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: Math.random().toString(36).substring(2, 15) + Date.now(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    PhoneNumber: phone,
    SignName: signName,
    TemplateCode: templateCode,
    TemplateParam: templateParam,
    ValidTime: "5", // 验证码有效期5分钟
  };

  // 计算签名
  const signature = await getSignature(params, accessKeySecret);
  params["Signature"] = signature;

  // 构建请求URL
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");

  const url = `https://dypnsapi.aliyuncs.com/?${queryString}`;

  console.log("调用阿里云短信接口, phone:", phone);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  console.log("阿里云短信接口返回 Code:", data.Code, "Message:", data.Message);

  return data;
}

console.info("sms-send function started");

export default {
  async fetch(req: Request): Promise<Response> {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { phone } = await req.json();

      if (!phone) {
        return Response.json(
          { success: false, message: "手机号不能为空" },
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // 简单的手机号格式校验
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        return Response.json(
          { success: false, message: "手机号格式不正确" },
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const result = await sendSmsVerifyCode(phone);

      // 阿里云返回 Code=OK 表示成功
      if (result.Code === "OK") {
        return Response.json(
          { success: true, message: "验证码已发送", requestId: result.RequestId },
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } else {
        return Response.json(
          {
            success: false,
            message: result.Message || "发送失败",
            code: result.Code,
            requestId: result.RequestId,
          },
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    } catch (err) {
      console.error("sms-send error:", err);
      return Response.json(
        { success: false, message: "发送失败: " + (err.message || String(err)) },
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  },
};
