import { type NextRequest, NextResponse } from "next/server";
import { type Session } from "@supabase/supabase-js";

const BASE64_PREFIX = "base64-";
const MAX_CHUNK_SIZE = 3180;
const SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
const STALE_CHUNK_SCAN_LIMIT = 10;

type CookieOptions = Parameters<NextResponse["cookies"]["set"]>[2];

function isChunkLike(cookieName: string, key: string) {
  if (cookieName === key) {
    return true;
  }

  const chunkLike = cookieName.match(/^(.*)[.](0|[1-9][0-9]*)$/);
  return Boolean(chunkLike && chunkLike[1] === key);
}

function createChunks(key: string, value: string) {
  let encodedValue = encodeURIComponent(value);

  if (encodedValue.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }];
  }

  const chunks: string[] = [];

  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, MAX_CHUNK_SIZE);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");

    if (lastEscapePos > MAX_CHUNK_SIZE - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }

    let valueHead = "";

    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (error instanceof URIError && encodedChunkHead.at(-3) === "%" && encodedChunkHead.length > 3) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
        } else {
          throw error;
        }
      }
    }

    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }

  return chunks.map((valueHead, index) => ({ name: `${key}.${index}`, value: valueHead }));
}

function encodeSession(session: Session) {
  return BASE64_PREFIX + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function persistSupabaseSessionCookie({
  cookieName,
  isSecure,
  request,
  response,
  session
}: {
  cookieName: string;
  isSecure: boolean;
  request: NextRequest;
  response: NextResponse;
  session: Session;
}) {
  const baseOptions: CookieOptions = {
    httpOnly: false,
    path: "/",
    sameSite: "lax",
    secure: isSecure
  };
  const staleCookieNames = new Set(
    request.cookies.getAll().filter((cookie) => isChunkLike(cookie.name, cookieName)).map((cookie) => cookie.name)
  );

  staleCookieNames.add(cookieName);
  for (let index = 0; index < STALE_CHUNK_SCAN_LIMIT; index += 1) {
    staleCookieNames.add(`${cookieName}.${index}`);
  }

  staleCookieNames.forEach((name) => {
    response.cookies.set(name, "", { ...baseOptions, maxAge: 0 });
  });

  const chunks = createChunks(cookieName, encodeSession(session));
  chunks.forEach(({ name, value }) => {
    response.cookies.set(name, value, {
      ...baseOptions,
      maxAge: SESSION_COOKIE_MAX_AGE
    });
  });

  return {
    chunkCount: chunks.length,
    cookieNames: chunks.map((chunk) => chunk.name)
  };
}
