// supabase/functions/security-check/index.ts
// 微信内容安全检测代理
// 部署: supabase functions deploy security-check --no-verify-jwt
// 环境变量需设置:
//   WECHAT_APPID  - 小程序 AppID
//   WECHAT_SECRET - 小程序 AppSecret

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const APPID = Deno.env.get("WECHAT_APPID") || "";
const SECRET = Deno.env.get("WECHAT_SECRET") || "";

// 缓存 access_token
let cachedToken = "";
let tokenExpireAt = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpireAt - 300000) {
    // 提前 5 分钟刷新
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
    scene: 1, // 资料
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
    media_type: 2, // 图片
    version: 2,
    scene: 1, // 资料
    openid: openid,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

// 同步图片检测 (小图片可直接检测)
async function imgSecCheck(
  accessToken: string,
  mediaUrl: string,
  openid: string
): Promise<any> {
  // 先下载图片
  const imgRes = await fetch(mediaUrl);
  const imgBlob = await imgRes.blob();

  // 限制 1MB
  if (imgBlob.size > 1048576) {
    // 大图片用异步检测
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

serve(async (req: Request) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { type, content, media_url, openid } = await req.json();

    if (!APPID || !SECRET) {
      return new Response(
        JSON.stringify({
          errcode: -1,
          errmsg: "服务端未配置 WECHAT_APPID 或 WECHAT_SECRET",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const accessToken = await getAccessToken();

    let result: any;

    if (type === "text") {
      result = await msgSecCheck(accessToken, content || "", openid || "");
    } else if (type === "image") {
      result = await imgSecCheck(accessToken, media_url || "", openid || "");
    } else {
      return new Response(
        JSON.stringify({ errcode: -1, errmsg: "未知的检测类型: " + type }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        errcode: -1,
        errmsg: "检测服务异常: " + (err.message || String(err)),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
