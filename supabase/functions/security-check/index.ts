// supabase/functions/security-check/index.ts
// 微信内容安全检测代理
// 适配新版 Supabase Edge Runtime (export default 模式)
// 环境变量需设置:
//   WECHAT_APPID  - 小程序 AppID
//   WECHAT_SECRET - 小程序 AppSecret

// 缓存 access_token
let cachedToken = "";
let tokenExpireAt = 0;

async function getAccessToken(): Promise<string> {
  const APPID = Deno.env.get("WECHAT_APPID") || "";
  const SECRET = Deno.env.get("WECHAT_SECRET") || "";

  const now = Date.now();
  if (cachedToken && now < tokenExpireAt - 300000) {
    return cachedToken;
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${SECRET}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.access_token) {
    cachedToken = data.access_token;
    tokenExpireAt = now + (data.expires_in || 7200) * 1000;
    return cachedToken;
  } else {
    throw new Error(`获取 access_token 失败: ${data.errcode} ${data.errmsg}`);
  }
}

async function msgSecCheck(
  accessToken: string,
  content: string,
  openid: string
): Promise<any> {
  const url = `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${accessToken}`;
  const body = {
    version: 2,
    scene: 1,
    openid: openid,
    content: content,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function mediaCheckAsync(
  accessToken: string,
  mediaUrl: string,
  openid: string
): Promise<any> {
  const url = `https://api.weixin.qq.com/wxa/media_check_async?access_token=${accessToken}`;
  const body = {
    media_url: mediaUrl,
    media_type: 2,
    version: 2,
    scene: 1,
    openid: openid,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function imgSecCheck(
  accessToken: string,
  mediaUrl: string,
  openid: string
): Promise<any> {
  const imgRes = await fetch(mediaUrl);
  const imgBlob = await imgRes.blob();

  if (imgBlob.size > 1048576) {
    return await mediaCheckAsync(accessToken, mediaUrl, openid);
  }

  const formData = new FormData();
  formData.append("media", imgBlob, "image.jpg");

  const url = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${accessToken}`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });
  return await res.json();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.info("security-check function started");

export default {
  async fetch(req: Request): Promise<Response> {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { type, content, media_url, openid } = await req.json();

      const APPID = Deno.env.get("WECHAT_APPID") || "";
      const SECRET = Deno.env.get("WECHAT_SECRET") || "";

      if (!APPID || !SECRET) {
        return Response.json(
          { errcode: -1, errmsg: "服务端未配置 WECHAT_APPID 或 WECHAT_SECRET" },
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const accessToken = await getAccessToken();

      let result: any;

      if (type === "text") {
        result = await msgSecCheck(accessToken, content || "", openid || "");
      } else if (type === "image") {
        result = await imgSecCheck(accessToken, media_url || "", openid || "");
      } else {
        return Response.json(
          { errcode: -1, errmsg: "未知的检测类型: " + type },
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return Response.json(result, {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (err) {
      return Response.json(
        { errcode: -1, errmsg: "检测服务异常: " + (err.message || String(err)) },
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  },
};
